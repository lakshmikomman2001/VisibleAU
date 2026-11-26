/**
 * S02 part 4 (LLD 8.2.2, 13; contract P02 view mode): GET /api/brands/:id/questions on the real database, for an
 * invented business seeded as real audits (tests/helpers/report-seeds.ts BLUEGUM) whose set version 1 comes from
 * prod-fix 0155's own backfill SQL.
 * - Signed out: 401. question_library off for the workspace: 404. Another workspace's brand: 404.
 * - One request: the set (version 1, the original questions, comparing since the first audit with its hash), every
 *   question in order with its last result per engine -- named, unconfirmed ("Maybe"), not named, failed -- the
 *   version history and the library.
 * - Suggestions: template alternatives made on the first request and stored (source template, status suggested),
 *   never one the brand already asks, not made again; none on Free.
 * - canEdit follows edit_brand_data (a viewer can't); nothing is editable until S03.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { backfillQuestionSets } from "@/tests/helpers/question-backfill";
import { BLUEGUM, type SeededReportBrand, seedReportBrand } from "@/tests/helpers/report-seeds";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const who = vi.hoisted(() => ({ orgId: "", role: "owner" as string, signedIn: true }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () =>
    who.signedIn
      ? {
          id: randomUUID(),
          organizationId: who.orgId,
          role: who.role,
          organization: { id: who.orgId, name: "Possum Marketing", region: "au", metadata: {} },
        }
      : null,
  ),
}));
vi.mock("@/lib/reports/enhanced-check-runners", () => ({
  enhancedRunners: () => ({ site: async () => undefined, youtube: async () => undefined }),
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let seed: SeededReportBrand;
let other: SeededReportBrand;

async function get(brandId: string) {
  const { GET } = await import("@/app/api/brands/[brandId]/questions/route");
  return GET(new Request(`http://localhost/api/brands/${brandId}/questions`), {
    params: Promise.resolve({ brandId }),
  });
}

async function setFlag(orgId: string, on: boolean) {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${orgId} AND flag_key = 'question_library'`;
  await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${orgId}, 'question_library', ${on})`;
}

async function prepare(s: SeededReportBrand) {
  await sql`UPDATE brands SET prompt_pack = ${sql.json([...BLUEGUM.everyday, ...BLUEGUM.branded])},
              classification_status = 'complete', location_mode = 'fixed', categories = ${BLUEGUM.categories},
              audience = 'households', category_confirmed_at = now(),
              classification = ${sql.json({ category: "trades_plumbing", buyerType: "consumer", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })}
            WHERE id = ${s.brandId}`;
  const { serviceDb } = await import("@/db/client");
  const { audits } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { questionSetHashSql } = await import("@/lib/audit/question-set-sql");
  for (const id of Object.values(s.audits)) {
    await serviceDb
      .update(audits)
      .set({ questionSetHash: questionSetHashSql(id) })
      .where(eq(audits.id, id));
  }
  await backfillQuestionSets(sql, s.orgId);
}

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  seed = await seedReportBrand(sql, BLUEGUM);
  other = await seedReportBrand(sql, BLUEGUM);
  await prepare(seed);
  await prepare(other);
  // The latest audit's answers, for every result state: Gemini's answer to question 2 named a "Bluegum" it couldn't
  // confirm, and Perplexity's call for question 3 failed (its answer is removed, a failure recorded in its place).
  const basis = seed.basisAuditId;
  await sql`UPDATE citations SET brand_mentioned = true, mention_verification = 'unverified'
    WHERE audit_id = ${basis} AND engine = 'gemini' AND prompt = ${BLUEGUM.everyday[1]}`;
  await sql`DELETE FROM citations WHERE audit_id = ${basis} AND engine = 'perplexity' AND prompt = ${BLUEGUM.everyday[2]}`;
  await sql`INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, error_class, attempts,
                                               latency_ms, is_branded_prompt)
    VALUES (${basis}, ${seed.orgId}, 'perplexity', ${BLUEGUM.everyday[2]}, 2, 'other', 1, 10, false)`;
  await setFlag(seed.orgId, true);
  await setFlag(other.orgId, true);
  who.orgId = seed.orgId;
}, 600_000);

afterAll(async () => {
  for (const s of [seed, other]) {
    await sql`DELETE FROM org_feature_flags WHERE organization_id = ${s.orgId} AND flag_key = 'question_library'`;
    await sql`DELETE FROM brand_question_set_items WHERE organization_id = ${s.orgId}`;
    await sql`DELETE FROM brand_question_sets WHERE organization_id = ${s.orgId}`;
    await sql`DELETE FROM engine_call_failures WHERE organization_id = ${s.orgId}`;
    await sql`UPDATE citations SET question_id = NULL WHERE audit_id = ANY(${Object.values(s.audits)})`;
    await sql`DELETE FROM brand_questions WHERE organization_id = ${s.orgId}`;
    await s.cleanup();
  }
  await sql.end();
});

interface Body {
  set: { version: number; original: boolean; comparingSinceAudit: number | null } | null;
  questions: Array<{
    text: string;
    kind: string;
    source: string;
    lastResult: Record<string, string> | null;
  }>;
  lastAudit: { number: number; engines: string[] } | null;
  history: Array<{
    version: number;
    everyday: number;
    audits: { from: number; to: number } | null;
  }>;
  library: Array<{ text: string; status: string }>;
  suggestions: Array<{ text: string }>;
  limits: { plan: string; suggestionsShown: boolean; canEdit: boolean; editable: boolean };
}

describe("GET /api/brands/:id/questions", () => {
  it("signed out: 401; the flag off for the workspace: 404; another workspace's brand: 404", async () => {
    who.signedIn = false;
    expect((await get(seed.brandId)).status).toBe(401);
    who.signedIn = true;
    await setFlag(seed.orgId, false);
    expect((await get(seed.brandId)).status).toBe(404);
    await setFlag(seed.orgId, true);
    expect((await get(other.brandId)).status).toBe(404);
    expect((await get("not-a-uuid")).status).toBe(404);
  });

  it("one request: version 1, the original questions in order, each with its last result per engine", async () => {
    const res = await get(seed.brandId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.set).toMatchObject({ version: 1, original: true, comparingSinceAudit: 53 });
    expect(body.questions.map((q) => q.text)).toEqual([...BLUEGUM.everyday, ...BLUEGUM.branded]);
    expect(new Set(body.questions.map((q) => q.source))).toEqual(new Set(["original"]));
    expect(body.questions.filter((q) => q.kind === "branded").map((q) => q.text)).toEqual([
      ...BLUEGUM.branded,
    ]);
    expect(body.lastAudit).toMatchObject({ number: 54 });
    // #54: ChatGPT named the business on questions 1 and 4, Claude on 2, Perplexity on 1, 3 and 6 (BLUEGUM).
    expect(body.questions[0].lastResult).toEqual({
      chatgpt: "named",
      claude: "not_named",
      gemini: "not_named",
      perplexity: "named",
    });
    expect(body.questions[1].lastResult?.gemini).toBe("unverified");
    expect(body.questions[2].lastResult?.perplexity).toBe("failed");
    // Version 1 (the backfill) links no past audit; #53 and #54 asked its questions (the same hash).
    expect(body.history).toMatchObject([
      { version: 1, everyday: 10, audits: { from: 53, to: 54 } },
    ]);
    expect(body.library.length).toBeGreaterThanOrEqual(body.questions.length);
    expect(body.limits).toMatchObject({
      plan: "agency",
      suggestionsShown: true,
      canEdit: true,
      editable: false,
    });
  });

  it("other workspaces' rows never show (RLS): the other brand's questions aren't in this one's library", async () => {
    const body = (await (await get(seed.brandId)).json()) as Body;
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM brand_questions WHERE organization_id = ${other.orgId}`;
    expect(n).toBeGreaterThan(0);
    expect(body.library.length).toBe(
      (
        await sql`SELECT 1 FROM brand_questions WHERE brand_id = ${seed.brandId} AND archived_at IS NULL`
      ).length,
    );
  });

  it("suggestions: made once from the brand's type and place, stored, none the set already asks", async () => {
    const first = (await (await get(seed.brandId)).json()) as Body;
    expect(first.suggestions.length).toBeGreaterThan(0);
    expect(first.suggestions.length).toBeLessThanOrEqual(5);
    const asked = new Set(first.questions.map((q) => q.text.toLowerCase()));
    for (const s of first.suggestions) expect(asked.has(s.text.toLowerCase()), s.text).toBe(false);
    const stored = await sql<{ source: string; status: string; kind: string }[]>`
      SELECT DISTINCT source, status, kind FROM brand_questions WHERE brand_id = ${seed.brandId} AND source = 'template'`;
    expect(stored).toEqual([{ source: "template", status: "suggested", kind: "everyday" }]);
    const again = (await (await get(seed.brandId)).json()) as Body;
    expect(again.suggestions).toEqual(first.suggestions);
  });

  it("a viewer can read it but not edit; Free gets no suggestions", async () => {
    who.role = "viewer";
    const viewer = (await (await get(seed.brandId)).json()) as Body;
    expect(viewer.limits.canEdit).toBe(false);
    expect(viewer.questions.length).toBe(BLUEGUM.everyday.length + BLUEGUM.branded.length);
    who.role = "owner";
    await sql`UPDATE subscriptions SET status = 'canceled' WHERE organization_id = ${seed.orgId}`;
    try {
      const free = (await (await get(seed.brandId)).json()) as Body;
      expect(free.limits).toMatchObject({ plan: "free", suggestionsShown: false });
      expect(free.suggestions).toEqual([]);
    } finally {
      await sql`UPDATE subscriptions SET status = 'active' WHERE organization_id = ${seed.orgId}`;
    }
  });
});
