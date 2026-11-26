/**
 * S02 part 2 (LLD 7A steps 1-5, N1-N4): prod-fix 0155's backfill, the exact SQL Sri runs (run2's BACKFILL section, read
 * from the file), on invented businesses seeded as real audits (tests/helpers/report-seeds.ts) whose stored packs are
 * the questions their audits asked. Only the test's own workspaces are taken (the one line added below), so the
 * shared test database's other brands are left alone.
 * - Each brand's set version 1 is its pack: the same questions, in the same order, current.
 * - Each question's kind is what lib/audit/flag-branded-prompts.ts isBrandedPrompt says of it (aliases included), and
 *   what the brand's latest complete audit stored (citations.is_branded_prompt): run1's check 5, 0 differences.
 * - comparison_hash equals the latest complete audit's question_set_hash (as the runners write it) and
 *   computeQuestionSetHash: run3's check 5.
 * - Skipped: a deleted brand, a brand with no pack, a brand in the free sample's workspace; a rerun writes nothing.
 * - run4 removes exactly what the backfill wrote.
 * - The SQL rule against the TS rule on prod-fix 0072's cases plus aliases.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isBrandedPrompt } from "@/lib/audit/flag-branded-prompts";
import { computeQuestionSetHash } from "@/lib/questions/hash";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import {
  BLUEGUM,
  IRONSTONE,
  KURRAJONG,
  type SeededReportBrand,
  type SeedSpec,
  seedReportBrand,
  WARATAH,
} from "@/tests/helpers/report-seeds";
import { sourceText } from "@/tests/helpers/source-files";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/reports/enhanced-check-runners", () => ({
  enhancedRunners: () => ({ site: async () => undefined, youtube: async () => undefined }),
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
const RUN2 = sourceText("db/prod-fixes/0155-s02-run2-apply.sql");
const RUN4 = sourceText("db/prod-fixes/0155-s02-run4-rollback.sql");
const NOTE = "0155 backfill: the stored question pack";

/**
 * The workspaces as an SQL array literal. The sections are several statements, which Postgres won't take as one
 * prepared statement with parameters, so the ids go in as text -- each checked to be a UUID first.
 */
function orgList(ids: readonly string[]): string {
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  return `ARRAY[${ids.map((id) => `'${id}'`).join(", ")}]::uuid[]`;
}

/** run2's backfill, taking only the given workspaces. */
function backfillSql(ids: readonly string[]): string {
  const begin = RUN2.indexOf("-- ==== BACKFILL (begin) ====");
  const end = RUN2.indexOf("-- ==== BACKFILL (end) ====");
  const section = RUN2.slice(begin, end);
  const filter = "  AND NOT EXISTS (SELECT 1 FROM brand_question_sets s WHERE s.brand_id = b.id);";
  expect(section).toContain(filter);
  return section.replace(
    filter,
    filter.replace(";", `\n  AND b.organization_id = ANY(${orgList(ids)});`),
  );
}

/** run4's rollback (without its final optional section), taking only the given workspaces. */
function rollbackSql(ids: readonly string[]): string {
  const body = RUN4.slice(RUN4.indexOf("BEGIN;") + "BEGIN;".length, RUN4.indexOf("COMMIT;"));
  const filter = "WHERE version = 1 AND note = '0155 backfill: the stored question pack';";
  expect(body).toContain(filter);
  return body.replace(filter, filter.replace(";", ` AND organization_id = ANY(${orgList(ids)});`));
}

async function runBackfill(ids: string[]) {
  await sql.begin(async (tx) => {
    await tx.unsafe(backfillSql(ids));
  });
}

/** Bluegum with an alias, and a question naming the business by it (typed branded only through the alias). */
const ALIASED: SeedSpec = {
  ...BLUEGUM,
  branded: [...BLUEGUM.branded, "Is Gumleaf Plumbing reputable?"],
};

const SPECS = { BLUEGUM, IRONSTONE, KURRAJONG, WARATAH, ALIASED } as const;
const seeds: Record<string, SeededReportBrand> = {};
const skipped: Record<"deleted" | "noPack" | "sample", { orgId: string; brandId: string }> =
  {} as never;
let sampleOrg: { id: string; created: boolean };

async function setPack(seed: SeededReportBrand, spec: SeedSpec) {
  await sql`UPDATE brands SET prompt_pack = ${sql.json([...spec.everyday, ...spec.branded])}, prompt_pack_version = 1
    WHERE id = ${seed.brandId}`;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  for (const [key, spec] of Object.entries(SPECS)) {
    const seed = await seedReportBrand(sql, spec);
    seeds[key] = seed;
    await setPack(seed, spec);
  }
  await sql`UPDATE brands SET aliases = ARRAY['Gumleaf Plumbing'] WHERE id = ${seeds.ALIASED.brandId}`;
  // What both runners write when an audit completes (lib/audit/question-set-sql.ts).
  const { serviceDb } = await import("@/db/client");
  const { audits } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { questionSetHashSql } = await import("@/lib/audit/question-set-sql");
  for (const seed of Object.values(seeds)) {
    for (const id of Object.values(seed.audits)) {
      await serviceDb
        .update(audits)
        .set({ questionSetHash: questionSetHashSql(id) })
        .where(eq(audits.id, id));
    }
  }
  // The skipped ones: a deleted brand with a pack, a brand with no pack, a pack in the free sample's workspace.
  const deleted = await seedReportBrand(sql, BLUEGUM);
  await setPack(deleted, BLUEGUM);
  await sql`UPDATE brands SET deleted_at = now() WHERE id = ${deleted.brandId}`;
  const noPack = await seedReportBrand(sql, KURRAJONG);
  seeds.deletedSeed = deleted;
  seeds.noPackSeed = noPack;
  const [existing] = await sql<
    { id: string }[]
  >`SELECT id FROM organizations WHERE slug = '__sample__'`;
  sampleOrg = existing ? { id: existing.id, created: false } : { id: randomUUID(), created: true };
  if (sampleOrg.created) {
    await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${sampleOrg.id}, ${`sample-${sampleOrg.id}`}, 'Sample', '__sample__')`;
  }
  const sampleBrand = randomUUID();
  await sql`INSERT INTO brands (id, organization_id, name, domain, vertical, region, prompt_pack)
    VALUES (${sampleBrand}, ${sampleOrg.id}, 'Sample Plumbing Demo', ${`${sampleBrand.slice(0, 8)}.example.com.au`},
            'tradies', 'au', ${sql.json([...BLUEGUM.everyday])})`;
  skipped.deleted = { orgId: deleted.orgId, brandId: deleted.brandId };
  skipped.noPack = { orgId: noPack.orgId, brandId: noPack.brandId };
  skipped.sample = { orgId: sampleOrg.id, brandId: sampleBrand };
  await runBackfill(orgIds());
}, 600_000);

function orgIds(): string[] {
  return [...Object.values(seeds).map((s) => s.orgId), sampleOrg.id];
}

afterAll(async () => {
  await sql`DELETE FROM brand_question_set_items WHERE organization_id = ANY(${orgIds()})`;
  await sql`DELETE FROM brand_question_sets WHERE organization_id = ANY(${orgIds()})`;
  await sql`DELETE FROM brand_questions WHERE organization_id = ANY(${orgIds()})`;
  await sql`DELETE FROM brands WHERE id = ${skipped.sample.brandId}`;
  if (sampleOrg.created) await sql`DELETE FROM organizations WHERE id = ${sampleOrg.id}`;
  for (const seed of Object.values(seeds)) await seed.cleanup();
  for (const seed of Object.values(seeds)) await deleteOrgRows(sql, seed.orgId);
  await sql.end();
});

async function setOf(brandId: string) {
  const sets = await sql<
    { id: string; version: number; is_current: boolean; comparison_hash: string; note: string }[]
  >`
    SELECT id, version, is_current, comparison_hash, note FROM brand_question_sets WHERE brand_id = ${brandId}`;
  const items = await sql<
    {
      text: string;
      kind: string;
      reach: string;
      source: string;
      status: string;
      position: number;
    }[]
  >`
    SELECT q.text, q.kind, q.reach, q.source, q.status, i.position
    FROM brand_question_set_items i JOIN brand_questions q ON q.id = i.question_id
    WHERE i.set_id = ${sets[0]?.id ?? randomUUID()} ORDER BY i.position`;
  return { sets, items };
}

async function latestAuditHash(seed: SeededReportBrand): Promise<string | null> {
  const [row] = await sql<{ h: string | null }[]>`
    SELECT question_set_hash AS h FROM audits WHERE brand_id = ${seed.brandId} AND status = 'complete'
    ORDER BY completed_at DESC NULLS LAST LIMIT 1`;
  return row?.h ?? null;
}

describe("the 0155 backfill: each brand's set version 1 is its stored pack", () => {
  it.each(
    Object.keys(SPECS),
  )("%s: one current version 1, the pack's questions in stored order", async (key) => {
    const spec = SPECS[key as keyof typeof SPECS];
    const { sets, items } = await setOf(seeds[key].brandId);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ version: 1, is_current: true, note: NOTE });
    expect(items.map((i) => i.text)).toEqual([...spec.everyday, ...spec.branded]);
    expect(items.map((i) => i.position)).toEqual(items.map((_, n) => n));
    expect(new Set(items.map((i) => `${i.reach}/${i.source}/${i.status}`))).toEqual(
      new Set(["local/original/ready"]),
    );
  });

  it.each(
    Object.keys(SPECS),
  )("%s: each kind is isBrandedPrompt's, aliases included", async (key) => {
    const [brand] = await sql<{ name: string; domain: string; aliases: string[] }[]>`
      SELECT name, domain, aliases FROM brands WHERE id = ${seeds[key].brandId}`;
    const { items } = await setOf(seeds[key].brandId);
    for (const item of items) {
      expect(item.kind, item.text).toBe(isBrandedPrompt(item.text, brand) ? "branded" : "everyday");
    }
    const spec = SPECS[key as keyof typeof SPECS];
    expect(items.filter((i) => i.kind === "everyday").map((i) => i.text)).toEqual([
      ...spec.everyday,
    ]);
  });

  it("the alias makes its question one that names the business", async () => {
    const { items } = await setOf(seeds.ALIASED.brandId);
    expect(items.find((i) => i.text === "Is Gumleaf Plumbing reputable?")?.kind).toBe("branded");
  });

  it("run1's check 5: no pack question's kind differs from how the latest complete audit stored it", async () => {
    const differences = await sql`
      WITH latest AS (
        SELECT DISTINCT ON (a.brand_id) a.brand_id, a.id AS audit_id FROM audits a
        WHERE a.status = 'complete' AND a.organization_id = ANY(${orgIds()})
        ORDER BY a.brand_id, a.completed_at DESC NULLS LAST)
      SELECT q.text FROM brand_questions q
      JOIN latest l ON l.brand_id = q.brand_id
      JOIN citations c ON c.audit_id = l.audit_id AND c.prompt = q.text
      GROUP BY q.brand_id, q.text, q.kind
      HAVING (q.kind = 'branded') IS DISTINCT FROM bool_or(c.is_branded_prompt IS TRUE)`;
    expect(differences).toEqual([]);
  });

  it.each(
    Object.keys(SPECS),
  )("%s: comparison_hash = the latest complete audit's question_set_hash = computeQuestionSetHash (N2)", async (key) => {
    const spec = SPECS[key as keyof typeof SPECS];
    const { sets } = await setOf(seeds[key].brandId);
    const audited = await latestAuditHash(seeds[key]);
    expect(audited).toMatch(/^[0-9a-f]{64}$/);
    expect(sets[0].comparison_hash).toBe(audited);
    expect(sets[0].comparison_hash).toBe(computeQuestionSetHash(spec.everyday));
  });
});

describe("what the backfill leaves alone", () => {
  it("a deleted brand, a brand with no pack and a pack in the free sample's workspace get nothing", async () => {
    for (const [name, s] of Object.entries(skipped)) {
      const [{ c }] = await sql<{ c: number }[]>`
        SELECT ((SELECT count(*) FROM brand_questions WHERE brand_id = ${s.brandId})
          + (SELECT count(*) FROM brand_question_sets WHERE brand_id = ${s.brandId}))::int AS c`;
      expect(c, name).toBe(0);
    }
  });

  it("a rerun writes nothing new", async () => {
    const count = async () =>
      (
        await sql<{ c: number }[]>`
          SELECT ((SELECT count(*) FROM brand_questions WHERE organization_id = ANY(${orgIds()}))
            + (SELECT count(*) FROM brand_question_sets WHERE organization_id = ANY(${orgIds()}))
            + (SELECT count(*) FROM brand_question_set_items WHERE organization_id = ANY(${orgIds()})))::int AS c`
      )[0].c;
    const before = await count();
    expect(before).toBeGreaterThan(0);
    await runBackfill(orgIds());
    expect(await count()).toBe(before);
  });
});

describe("run4", () => {
  it("removes exactly what the backfill wrote, clearing any link to it first; then a rerun of run2 puts it back", async () => {
    const seed = seeds.BLUEGUM;
    const { sets } = await setOf(seed.brandId);
    const [anyQuestion] = await sql<{ id: string }[]>`
      SELECT question_id AS id FROM brand_question_set_items WHERE set_id = ${sets[0].id} LIMIT 1`;
    await sql`UPDATE audits SET question_set_id = ${sets[0].id} WHERE id = ${seed.basisAuditId}`;
    await sql`UPDATE citations SET question_id = ${anyQuestion.id} WHERE audit_id = ${seed.basisAuditId}`;
    // A question a later set also uses stays (only run2's rows go).
    const [kept] = await sql<{ id: string }[]>`
      INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
      VALUES (${seed.orgId}, ${seed.brandId}, 'A question an agency wrote later', question_text_key('A question an agency wrote later'),
              'everyday', 'agency') RETURNING id`;
    await sql.begin(async (tx) => {
      await tx.unsafe(rollbackSql(orgIds()));
    });
    for (const key of Object.keys(SPECS))
      expect((await setOf(seeds[key].brandId)).sets, key).toEqual([]);
    expect(await sql`SELECT question_set_id FROM audits WHERE id = ${seed.basisAuditId}`).toEqual([
      { question_set_id: null },
    ]);
    expect(
      await sql`SELECT 1 FROM citations WHERE audit_id = ${seed.basisAuditId} AND question_id IS NOT NULL`,
    ).toHaveLength(0);
    expect(await sql`SELECT id FROM brand_questions WHERE brand_id = ${seed.brandId}`).toEqual([
      { id: kept.id },
    ]);
    await sql`DELETE FROM brand_questions WHERE id = ${kept.id}`;
    await runBackfill(orgIds());
    expect((await setOf(seed.brandId)).items.map((i) => i.text)).toEqual([
      ...BLUEGUM.everyday,
      ...BLUEGUM.branded,
    ]);
  });
});

describe("the SQL rule against isBrandedPrompt", () => {
  const brand = {
    name: "Wren Home Services",
    domain: "wrenhome.example.com.au",
    aliases: ["Gumleaf Plumbing"],
  };
  const CASES = [
    "Is Wren Home Services reputable?",
    'What do customers say about "Wren Home Services"?',
    "Is **Wren Home Services** any good?",
    "Wren Home Services' reviews",
    "Wren Home Services’s prices",
    "Wren-Home-Services near me",
    "WREN HOME SERVICES quote",
    "Wren Home Servicesxyz is a different word",
    "Best home services in Wren",
    "Is wrenhome.example.com.au legit?",
    "Is Gumleaf Plumbing reputable?",
    "Gumleaf plumbers are everywhere",
    "Who is the best plumber in Chatswood?",
  ];

  it("gives the same verdict on every case", async () => {
    await sql.begin(async (tx) => {
      const section = backfillSql([randomUUID()]);
      const functions = section.slice(0, section.indexOf("-- The packs to take"));
      await tx.unsafe(functions);
      for (const text of CASES) {
        const [row] = await tx<{ v: boolean }[]>`
          SELECT pg_temp.s02_is_branded(${text}, ${brand.name}, ${brand.domain}, ${brand.aliases}::text[]) AS v`;
        expect(row.v, text).toBe(isBrandedPrompt(text, brand));
      }
    });
  });
});
