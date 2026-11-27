/**
 * S04 part 7 (LLD 8.4.6, 10): an audit's Visibility per reach, stored when it completes -- by the inline runner and by
 * the Inngest one -- on the mock model (no network).
 * - A set with 4 Local, 3 NSW and 3 Australia everyday questions (and 2 naming the business): one row per reach; each
 *   reach's answers are its questions' run-1 everyday answers, its mentions those not 'unverified'; the reaches add up
 *   to the headline's counts (the 0157 backfill's formula); the 95% Wilson interval as lib/scoring/wilson.ts; each
 *   reach's hash its own questions', so the three differ.
 * - A Local-only brand: one Local row whose hash is the audit's question_set_hash (so its trend compares as today).
 * - comparableReachResults: the reach's audits with the same reach_hash, an excluded audit left out.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { computeQuestionSetHash } from "@/lib/questions/hash";
import { wilsonCI } from "@/lib/scoring/wilson";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/brand-entity/wikipedia-au", async (importOriginal) =>
  (await import("@/tests/helpers/recorded-network")).recordedWikipedia(importOriginal),
);

const ORG = randomUUID();
let sql: ReturnType<typeof postgres>;
let auditNumber = 0;

const LOCAL = [
  "Who is the best plumber in Chatswood?",
  "Which plumber near Chatswood can come today?",
  "Who fixes blocked drains in Chatswood?",
  "Who repairs leaking taps in Chatswood?",
];
const STATE = [
  "Can you recommend a plumber in NSW?",
  "Who are the most trusted plumbers in NSW?",
  "Which plumbing companies in NSW have the best reviews?",
];
const COUNTRY = [
  "Can you recommend a plumber in Australia?",
  "Who are the most trusted plumbers in Australia?",
  "Which Australian plumbing companies have the best reviews?",
];
const BRANDED = [
  "Is Galah Reach Plumbing reputable?",
  "Does Galah Reach Plumbing work in Chatswood?",
];

type Handler = (ctx: {
  event: { data: Record<string, unknown> };
  step: unknown;
}) => Promise<unknown>;
const step = {
  run: async (_id: string, fn: () => unknown) => fn(),
  sleep: async () => undefined,
  sendEvent: async () => ({ ids: [] }),
};

async function brandWithSet(items: Array<{ text: string; kind: string; reach: string }>) {
  const brandId = randomUUID();
  const pack = items.map((i) => i.text);
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack,
      prompt_pack_generator_version, classification_status, classification, categories, audience,
      category_confirmed_at, suburb, state, country, location_mode, location_confirmed_at)
    VALUES (${brandId}, ${ORG}, 'Galah Reach Plumbing', ${`${brandId.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
      ARRAY['NSW:Chatswood']::text[], ${sql.json(pack)}, ${PROMPT_GENERATOR_VERSION}, 'complete',
      ${sql.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      ARRAY['trades_plumbing']::text[], 'households', now(), 'Chatswood', 'NSW', 'Australia', 'fixed', now())`;
  const everyday = items.filter((i) => i.kind === "everyday").map((i) => i.text);
  const [set] = await sql<{ id: string }[]>`
    INSERT INTO brand_question_sets (organization_id, brand_id, version, is_current, comparison_hash)
    VALUES (${ORG}, ${brandId}, 1, true, ${computeQuestionSetHash(everyday) as string}) RETURNING id`;
  for (const [position, item] of items.entries()) {
    const [q] = await sql<{ id: string }[]>`
      INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source, reach)
      VALUES (${ORG}, ${brandId}, ${item.text}, question_text_key(${item.text}), ${item.kind}, 'original', ${item.reach})
      RETURNING id`;
    await sql`INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
      VALUES (${set.id}, ${ORG}, ${q.id}, ${position}, ${item.kind}, ${item.reach}, 'original')`;
  }
  return brandId;
}

async function newAudit(brandId: string) {
  const auditId = randomUUID();
  auditNumber++;
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
    VALUES (${auditId}, ${brandId}, ${ORG}, ${auditNumber}, 'manual', 'pending', ${sql.json({ mockScenario: "happy_path" })})`;
  return auditId;
}

/** The headline's counts, as 0157's backfill computes them (Google not counted here). */
async function headlineCounts(auditId: string) {
  const [row] = await sql<{ n: number; m: number }[]>`
    SELECT count(*)::int AS n,
           count(*) FILTER (WHERE brand_mentioned AND mention_verification IS DISTINCT FROM 'unverified')::int AS m
    FROM citations WHERE audit_id = ${auditId} AND is_branded_prompt IS NOT TRUE AND run_number = 1`;
  return row;
}

async function reachRows(auditId: string) {
  return sql<
    {
      reach: string;
      everyday_answers: number;
      mentioned: number;
      ci_low: string | null;
      ci_high: string | null;
      reach_hash: string;
    }[]
  >`SELECT reach, everyday_answers, mentioned, ci_low, ci_high, reach_hash FROM audit_reach_results
    WHERE audit_id = ${auditId} ORDER BY array_position(ARRAY['local','state','country','global'], reach)`;
}

async function checkThreeReaches(auditId: string) {
  const rows = await reachRows(auditId);
  expect(rows.map((r) => r.reach)).toEqual(["local", "state", "country"]);
  const [{ engines }] = await sql<{ engines: number }[]>`
    SELECT count(DISTINCT engine)::int AS engines FROM citations WHERE audit_id = ${auditId} AND run_number = 1`;
  expect(engines).toBeGreaterThan(0);
  expect(rows.map((r) => r.everyday_answers)).toEqual([4 * engines, 3 * engines, 3 * engines]);
  const headline = await headlineCounts(auditId);
  expect(rows.reduce((s, r) => s + r.everyday_answers, 0)).toBe(headline.n);
  expect(rows.reduce((s, r) => s + r.mentioned, 0)).toBe(headline.m);
  for (const r of rows) {
    const ci = wilsonCI(r.mentioned, r.everyday_answers);
    // wilsonCI answers in percent; the table holds fractions.
    expect(Number(r.ci_low)).toBeCloseTo(ci.lower / 100, 4);
    expect(Number(r.ci_high)).toBeCloseTo(ci.upper / 100, 4);
  }
  expect(new Set(rows.map((r) => r.reach_hash)).size).toBe(3);
  return rows;
}

const THREE = [
  ...LOCAL.map((text) => ({ text, kind: "everyday", reach: "local" })),
  ...STATE.map((text) => ({ text, kind: "everyday", reach: "state" })),
  ...COUNTRY.map((text) => ({ text, kind: "everyday", reach: "country" })),
  ...BRANDED.map((text) => ({ text, kind: "branded", reach: "local" })),
];

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "false");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`reach-results-${ORG}`}, 'Reach Results Org', ${`reach-results-${ORG}`})`;
  await sql`INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
                                       tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_${ORG}`}, ${`sub_${ORG}`}, 'price_test', 'agency', 'monthly', 'active')`;
}, 60_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await sql`DELETE FROM audit_reach_results WHERE organization_id = ${ORG}`;
  await deleteOrgRows(sql, ORG);
  await sql.end();
});

describe("audit results per reach", () => {
  let inlineRows: Awaited<ReturnType<typeof reachRows>>;
  it("the inline runner stores one row per reach, adding up to the headline", async () => {
    const brandId = await brandWithSet(THREE);
    const auditId = await newAudit(brandId);
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
    await runAuditInline(auditId);
    const [audit] = await sql<
      { status: string }[]
    >`SELECT status FROM audits WHERE id = ${auditId}`;
    expect(audit.status).toBe("complete");
    inlineRows = await checkThreeReaches(auditId);
  }, 180_000);

  it("the Inngest runner stores the same, with the same hashes for the same questions", async () => {
    const [{ id: brandId }] = await sql<{ id: string }[]>`
      SELECT brand_id AS id FROM audits WHERE organization_id = ${ORG} ORDER BY audit_number LIMIT 1`;
    const auditId = await newAudit(brandId);
    const { runAudit } = await import("@/inngest/functions/run-audit");
    await (runAudit as unknown as { fn: Handler }).fn({
      event: { data: { auditId, organizationId: ORG } },
      step,
    });
    const rows = await checkThreeReaches(auditId);
    expect(rows.map((r) => r.reach_hash)).toEqual(inlineRows.map((r) => r.reach_hash));

    const { comparableReachResults } = await import("@/lib/reach/results");
    const { withRlsContext } = await import("@/db/client");
    const comparable = () =>
      withRlsContext(ORG, (tx) =>
        comparableReachResults(tx, {
          brandId,
          organizationId: ORG,
          reach: "state",
          reachHash: rows[1].reach_hash,
        }),
      );
    expect((await comparable()).map((r) => r.auditNumber)).toEqual([1, 2]);
    await sql`UPDATE audits SET excluded_from_trends_reason = 'test' WHERE id = ${auditId}`;
    expect((await comparable()).map((r) => r.auditNumber)).toEqual([1]);
  }, 180_000);

  it("a Local-only brand: one Local row, its hash the audit's question_set_hash", async () => {
    const brandId = await brandWithSet([
      ...[...LOCAL, "Who installs hot water systems in Chatswood?"].map((text) => ({
        text,
        kind: "everyday",
        reach: "local",
      })),
      ...BRANDED.map((text) => ({ text, kind: "branded", reach: "local" })),
    ]);
    const auditId = await newAudit(brandId);
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
    await runAuditInline(auditId);
    const rows = await reachRows(auditId);
    const [audit] = await sql<{ question_set_hash: string }[]>`
      SELECT question_set_hash FROM audits WHERE id = ${auditId}`;
    expect(rows.map((r) => r.reach)).toEqual(["local"]);
    expect(rows[0].reach_hash).toBe(audit.question_set_hash);
    const headline = await headlineCounts(auditId);
    expect([rows[0].everyday_answers, rows[0].mentioned]).toEqual([headline.n, headline.m]);
  }, 180_000);
});
