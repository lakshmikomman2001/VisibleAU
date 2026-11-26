/**
 * S03 part 0 (LLD amendment 75): 0155's reference rule on the real schema. brand_question_set_items.question_id
 * references brand_questions DEFERRABLE INITIALLY DEFERRED (not RESTRICT), so a hard delete cascades through the
 * question tables in one statement, and the check still runs at commit.
 *
 * audits.brand_id and audits.organization_id (and brands.organization_id, and every other table that names a brand)
 * are NO ACTION, as they were before 0155: a brand or workspace that has audits is never removed by one DELETE, with or
 * without questions. The app soft-deletes brands and closes workspaces; its one hard delete is the sample audit's
 * clean-up (lib/sample-audit/retention.ts), which deletes an audit's failures, answers and the audit before the brand.
 * So, children first, as that clean-up does:
 * - the clean-up itself hard-deletes a sample brand whose audit's answers (citations) and failures
 *   (engine_call_failures) carry question ids, and its questions, set and items go with the brand;
 * - a workspace removed the same way, in one transaction (failures, audits with their answers, the brand, the
 *   workspace), commits: the deferred check finds no item pointing at a missing question;
 * - deleting a question a set uses, on its own, still fails (at commit: 23503).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
const orgs: string[] = [];

interface Seeded {
  orgId: string;
  brandId: string;
  setId: string;
  questionIds: string[];
  auditId: string;
}

/**
 * A brand with a current set of two questions, and one audit that asked it: answers and a failure. In a new workspace,
 * or in `orgId` (the sample workspace) with the brand made `createdAt`.
 */
async function seed(label: string, inOrg?: { orgId: string; createdAt: string }): Promise<Seeded> {
  const orgId = inOrg?.orgId ?? randomUUID();
  const brandId = randomUUID();
  const auditId = randomUUID();
  if (!inOrg) {
    orgs.push(orgId);
    const slug = `question-cascade-${label}-${orgId}`;
    await sql`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${orgId}, ${slug}, 'Question Cascade', ${slug})`;
  }
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, created_at)
    VALUES (${brandId}, ${orgId}, 'Galah Plumbing', ${`${brandId.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
            ${inOrg?.createdAt ?? new Date().toISOString()})`;
  const texts = ["Who can unblock a drain in Chatswood today?", "Is Galah Plumbing reputable?"];
  const questionIds: string[] = [];
  for (const [i, text] of texts.entries()) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
      VALUES (${orgId}, ${brandId}, ${text}, question_text_key(${text}), ${i === 0 ? "everyday" : "branded"}, 'original')
      RETURNING id`;
    questionIds.push(row.id);
  }
  const [set] = await sql<{ id: string }[]>`
    INSERT INTO brand_question_sets (organization_id, brand_id, version, is_current, comparison_hash)
    VALUES (${orgId}, ${brandId}, 1, true, 'hash-1') RETURNING id`;
  for (const [i, questionId] of questionIds.entries()) {
    await sql`
      INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
      VALUES (${set.id}, ${orgId}, ${questionId}, ${i}, ${i === 0 ? "everyday" : "branded"}, 'local', 'original')`;
  }
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, question_set_id)
    VALUES (${auditId}, ${brandId}, ${orgId}, 1, 'complete', ${set.id})`;
  for (const [i, questionId] of questionIds.entries()) {
    await sql`
      INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt,
                             question_id)
      VALUES (${auditId}, 'chatgpt', ${texts[i]}, ${i}, 1, ${i === 1}, ${i === 1}, ${questionId})`;
  }
  await sql`
    INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, error_class, attempts,
                                      latency_ms, is_branded_prompt, question_id)
    VALUES (${auditId}, ${orgId}, 'claude', ${texts[0]}, 0, 'other', 1, 10, false, ${questionIds[0]})`;
  return { orgId, brandId, setId: set.id, questionIds, auditId };
}

/** Every row of the seed that still exists, by table. */
async function left(s: Seeded): Promise<Record<string, number>> {
  const [row] = await sql<Record<string, number>[]>`
    SELECT
      (SELECT count(*) FROM brands WHERE id = ${s.brandId})::int AS brands,
      (SELECT count(*) FROM brand_questions WHERE id = ANY(${s.questionIds}))::int AS questions,
      (SELECT count(*) FROM brand_question_sets WHERE id = ${s.setId})::int AS sets,
      (SELECT count(*) FROM brand_question_set_items WHERE set_id = ${s.setId})::int AS items,
      (SELECT count(*) FROM audits WHERE id = ${s.auditId})::int AS audits,
      (SELECT count(*) FROM citations WHERE audit_id = ${s.auditId})::int AS answers,
      (SELECT count(*) FROM engine_call_failures WHERE audit_id = ${s.auditId})::int AS failures`;
  return row;
}

const NONE = { brands: 0, questions: 0, sets: 0, items: 0, audits: 0, answers: 0, failures: 0 };
const ALL = { brands: 1, questions: 2, sets: 1, items: 2, audits: 1, answers: 2, failures: 1 };

async function errorCode(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

afterAll(async () => {
  await sql`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ANY(${orgs}))`;
  await sql`DELETE FROM engine_call_failures WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM audits WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_question_set_items WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_question_sets WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brand_questions WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM brands WHERE organization_id = ANY(${orgs})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${orgs})`;
  await sql.end();
});

describe("0155's deferred reference on the real schema (amendment 75)", () => {
  it("the app's hard delete (the sample clean-up) removes a brand whose answers and failures link its questions", async () => {
    // The sample workspace, as lib/sample-audit/run.ts makes it when the first sample audit runs.
    const [existing] = await sql<
      { id: string }[]
    >`SELECT id FROM organizations WHERE slug = '__sample__'`;
    let sampleOrg = existing?.id;
    if (!sampleOrg) {
      sampleOrg = randomUUID();
      orgs.push(sampleOrg);
      await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
        VALUES (${sampleOrg}, ${`sample-${sampleOrg}`}, 'Sample audits', '__sample__')`;
    }
    // Made two days ago: past the clean-up's 24 hours.
    const s = await seed("sample", {
      orgId: sampleOrg,
      createdAt: new Date(Date.now() - 48 * 3_600_000).toISOString(),
    });
    expect(await left(s)).toEqual(ALL);
    process.env.DATABASE_URL = getTestDatabaseUrl();
    process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
    const { deleteExpiredSampleData } = await import("@/lib/sample-audit/retention");
    const result = await deleteExpiredSampleData();
    expect(result.failedBrands).toBe(0);
    expect(result.deletedBrands).toBeGreaterThanOrEqual(1);
    expect(await left(s)).toEqual(NONE);
  });

  it("a workspace removed children first, in one transaction, commits; every row goes", async () => {
    const s = await seed("workspace");
    expect(await left(s)).toEqual(ALL);
    const removed = await errorCode(() =>
      sql.begin(async (tx) => {
        await tx`DELETE FROM engine_call_failures WHERE organization_id = ${s.orgId}`;
        await tx`DELETE FROM audits WHERE organization_id = ${s.orgId}`;
        await tx`DELETE FROM brands WHERE organization_id = ${s.orgId}`;
        await tx`DELETE FROM organizations WHERE id = ${s.orgId}`;
      }),
    );
    expect(removed).toBeNull();
    expect(await left(s)).toEqual(NONE);
    expect(await sql`SELECT 1 FROM organizations WHERE id = ${s.orgId}`).toHaveLength(0);
  });

  it("the brand delete alone, after its audits, takes the questions, set and items in one statement", async () => {
    const s = await seed("brand");
    await sql`DELETE FROM engine_call_failures WHERE audit_id = ${s.auditId}`;
    await sql`DELETE FROM audits WHERE id = ${s.auditId}`;
    expect(await errorCode(() => sql`DELETE FROM brands WHERE id = ${s.brandId}`)).toBeNull();
    expect(await left(s)).toEqual(NONE);
  });

  it("deleting a question its set uses, on its own, still fails at commit; nothing is deleted", async () => {
    const s = await seed("question");
    // The question's answers and failure would go with it, so only the set's item stands in the way.
    await sql`UPDATE citations SET question_id = NULL WHERE audit_id = ${s.auditId}`;
    await sql`UPDATE engine_call_failures SET question_id = NULL WHERE audit_id = ${s.auditId}`;
    expect(
      await errorCode(() => sql`DELETE FROM brand_questions WHERE id = ${s.questionIds[0]}`),
    ).toBe("23503");
    expect(
      await errorCode(() =>
        sql.begin(async (tx) => {
          await tx`DELETE FROM brand_questions WHERE id = ${s.questionIds[0]}`;
        }),
      ),
    ).toBe("23503");
    expect(await left(s)).toEqual(ALL);
  });

  it("the reference really is deferred: inside a transaction the delete waits for commit", async () => {
    const [ref] = await sql<{ deferrable: boolean; deferred: boolean }[]>`
      SELECT condeferrable AS deferrable, condeferred AS deferred FROM pg_constraint
      WHERE conrelid = 'brand_question_set_items'::regclass AND contype = 'f'
        AND confrelid = 'brand_questions'::regclass`;
    expect(ref).toEqual({ deferrable: true, deferred: true });
  });
});
