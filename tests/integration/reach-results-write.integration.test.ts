/**
 * S04B part 3 (LLD amendment 104): writeAuditReachResults (lib/reach/results.ts) on the real database.
 * - The delete and the insert are one transaction: a re-write that fails keeps the rows already there.
 * - A failure is one structured log line -- event reach_results_not_stored, the audit id, the SQLSTATE -- never the SQL
 *   or its parameters.
 * - An audit that asked no everyday question stores Local 0 of 0 with no interval, hashed as 0157's backfill does; one
 *   whose everyday calls all failed stores 0 of 0 per reach with no interval.
 * - A question beyond Local that was answered from the cache keeps its time: the cache read with its reach's scope
 *   gives the answer's fetchedAt, which both runners store as citations.cached_from_at, the audit page's "reused
 *   answers fetched at" figure (app/(auth)/audits/[auditId]/page.tsx reads MIN(cached_from_at)).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/db/client";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { computeQuestionSetHash } from "@/lib/questions/hash";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/brand-entity/wikipedia-au", async (importOriginal) =>
  (await import("@/tests/helpers/recorded-network")).recordedWikipedia(importOriginal),
);

const ORG = randomUUID();
let sql: ReturnType<typeof postgres>;
let auditNumber = 0;

const ITEMS = [
  { text: "Who is the best plumber in Kurrajong Heights?", kind: "everyday", reach: "local" },
  {
    text: "Which plumber near Kurrajong Heights can come today?",
    kind: "everyday",
    reach: "local",
  },
  { text: "Can you recommend a plumber in NSW?", kind: "everyday", reach: "state" },
  { text: "Who are the most trusted plumbers in NSW?", kind: "everyday", reach: "state" },
  { text: "Can you recommend a plumber in Australia?", kind: "everyday", reach: "country" },
  { text: "Is Wattle Write Plumbing reputable?", kind: "branded", reach: "local" },
];

async function brandWithSet(items: typeof ITEMS) {
  const brandId = randomUUID();
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack,
      prompt_pack_generator_version, classification_status, classification, categories, audience,
      category_confirmed_at, suburb, state, country, location_mode, location_confirmed_at)
    VALUES (${brandId}, ${ORG}, 'Wattle Write Plumbing', ${`${brandId.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
      ARRAY['NSW:Kurrajong Heights']::text[], ${sql.json(items.map((i) => i.text))}, ${PROMPT_GENERATOR_VERSION},
      'complete',
      ${sql.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      ARRAY['trades_plumbing']::text[], 'households', now(), 'Kurrajong Heights', 'NSW', 'Australia', 'fixed', now())`;
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
  return { brandId, setId: set.id };
}

async function newAudit(
  brandId: string,
  extra: {
    status?: string;
    questionSetHash?: string | null;
    promptPackVersion?: number;
    setId?: string;
  } = {},
) {
  const auditId = randomUUID();
  auditNumber++;
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata, question_set_hash,
      prompt_pack_version, question_set_id)
    VALUES (${auditId}, ${brandId}, ${ORG}, ${auditNumber}, 'manual', ${extra.status ?? "pending"},
      ${sql.json({ mockScenario: "happy_path" })}, ${extra.questionSetHash ?? null}, ${extra.promptPackVersion ?? 1},
      ${extra.setId ?? null})`;
  return auditId;
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

/** serviceDb, except that every INSERT fails as Postgres would: a check violation, SQLSTATE 23514, wrapped as
 * drizzle wraps a failed query (the driver's error as `cause`). */
async function dbWhoseInsertFails(): Promise<DbClient> {
  const { serviceDb } = await import("@/db/client");
  const failing = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(t, prop, receiver) {
        if (prop === "insert") {
          return () => {
            throw Object.assign(
              new Error('Failed query: insert into "audit_reach_results" ... params: ...'),
              {
                cause: Object.assign(new Error("new row violates check constraint"), {
                  code: "23514",
                }),
              },
            );
          };
        }
        if (prop === "transaction") {
          return (fn: (tx: unknown) => Promise<unknown>) =>
            (
              t as unknown as {
                transaction: (f: (tx: object) => Promise<unknown>) => Promise<unknown>;
              }
            ).transaction((tx) => fn(failing(tx)));
        }
        return Reflect.get(t, prop, receiver);
      },
    });
  return failing(serviceDb) as unknown as DbClient;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "false");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`reach-write-${ORG}`}, 'Reach Write Org', ${`reach-write-${ORG}`})`;
  await sql`INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
                                       tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_${ORG}`}, ${`sub_${ORG}`}, 'price_test', 'agency', 'monthly', 'active')`;
}, 60_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await sql`DELETE FROM audit_reach_results WHERE organization_id = ${ORG}`;
  await deleteOrgRows(sql, ORG);
  await sql.end();
});

describe("writing an audit's results per reach (amendment 104)", () => {
  let auditId: string;

  it("a re-write that fails keeps the rows already there, and logs one line: event, audit id, SQLSTATE", async () => {
    const { brandId } = await brandWithSet(ITEMS);
    auditId = await newAudit(brandId);
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
    await runAuditInline(auditId);
    const before = await reachRows(auditId);
    expect(before.map((r) => r.reach)).toEqual(["local", "state", "country"]);

    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { writeAuditReachResults } = await import("@/lib/reach/results");
    await writeAuditReachResults(await dbWhoseInsertFails(), { auditId, organizationId: ORG });

    expect(await reachRows(auditId)).toEqual(before);
    const lines = errors.mock.calls.filter((c) =>
      String(c[0]).includes("reach_results_not_stored"),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(1);
    expect(JSON.parse(String(lines[0][0]))).toEqual({
      event: "reach_results_not_stored",
      auditId,
      sqlstate: "23514",
    });
    expect(String(lines[0][0])).not.toMatch(/insert|params|audit_reach_results/i);
    errors.mockRestore();
  });

  it("an audit that asked no everyday question stores Local 0 of 0 with no interval, hashed as the backfill does", async () => {
    const { brandId } = await brandWithSet(ITEMS);
    const { writeAuditReachResults } = await import("@/lib/reach/results");
    const hashed = await newAudit(brandId, { status: "complete", questionSetHash: "abc123" });
    await writeAuditReachResults((await import("@/db/client")).serviceDb, {
      auditId: hashed,
      organizationId: ORG,
    });
    expect(await reachRows(hashed)).toEqual([
      {
        reach: "local",
        everyday_answers: 0,
        mentioned: 0,
        ci_low: null,
        ci_high: null,
        reach_hash: "abc123",
      },
    ]);
    const old = await newAudit(brandId, {
      status: "complete",
      questionSetHash: null,
      promptPackVersion: 3,
    });
    await writeAuditReachResults((await import("@/db/client")).serviceDb, {
      auditId: old,
      organizationId: ORG,
    });
    expect((await reachRows(old))[0]).toMatchObject({
      everyday_answers: 0,
      ci_low: null,
      ci_high: null,
      reach_hash: "prompt_pack_version:3",
    });
  });

  it("an audit whose everyday calls all failed stores 0 of 0 per reach, with no interval", async () => {
    const { brandId, setId } = await brandWithSet(ITEMS);
    const failed = await newAudit(brandId, { status: "complete", setId });
    for (const [i, item] of ITEMS.entries()) {
      await sql`INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index,
          is_branded_prompt, error_class, error_message, attempts, latency_ms)
        VALUES (${failed}, ${ORG}, 'chatgpt', ${item.text}, ${i}, ${item.kind === "branded"}, 'provider_quota',
          'HTTP 429 insufficient_quota: out of quota', 1, 10)`;
    }
    const { writeAuditReachResults } = await import("@/lib/reach/results");
    await writeAuditReachResults((await import("@/db/client")).serviceDb, {
      auditId: failed,
      organizationId: ORG,
    });
    const rows = await reachRows(failed);
    expect(
      rows.map((r) => [r.reach, r.everyday_answers, r.mentioned, r.ci_low, r.ci_high]),
    ).toEqual([
      ["local", 0, 0, null, null],
      ["state", 0, 0, null, null],
      ["country", 0, 0, null, null],
    ]);
  });
});

describe("the cached time of a question beyond Local (amendment 104)", () => {
  it("a State question's cached answer is read back with its reach's scope, carrying when it was fetched", async () => {
    const { engineCallReach } = await import("@/lib/reach/engine-location");
    const { getCached, setCached } = await import("@/lib/llm/cache");
    const brand = {
      locationMode: "fixed" as const,
      locationConfirmedAt: new Date(),
      city: "Kurrajong Heights",
      state: "NSW",
      region: "au" as const,
    };
    const { cacheScope } = engineCallReach("state", "chatgpt", brand);
    expect(cacheScope).toMatch(/^reach=state;/);
    const prompt = `Can you recommend a plumber in NSW? (${ORG})`;
    await setCached(
      prompt,
      "gpt-4.1-mini",
      { response: "A cached State answer.", tokensUsed: 10, costEstimateUsd: 0.001 },
      "grounded",
      cacheScope,
    );
    const [row] = await sql<{ fetched_at: Date }[]>`
      SELECT fetched_at FROM llm_response_cache WHERE prompt = ${prompt}`;
    const hit = await getCached(prompt, "gpt-4.1-mini", "chatgpt", "grounded", {
      scope: cacheScope,
    });
    expect(hit?.response).toBe("A cached State answer.");
    expect(hit?.cachedFromAt?.toISOString()).toBe(row.fetched_at.toISOString());
    // Never replayed for the same words asked as a Local question.
    expect(await getCached(prompt, "gpt-4.1-mini", "chatgpt", "grounded")).toBeNull();
    await sql`DELETE FROM llm_response_cache WHERE prompt = ${prompt}`;
  });
});
