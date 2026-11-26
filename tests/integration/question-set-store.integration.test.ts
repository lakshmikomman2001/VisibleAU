/**
 * S02 part 3 (LLD 7A step 5, 8.2.1): lib/questions/question-set-store.ts writeSetFromPack, the one place a stored pack
 * becomes a set version after the backfill, on the real database:
 * - every question it creates is typed by isBrandedPrompt (aliases included): the TS check and the stored kind agree;
 * - each version is current in turn, numbered on; questions the new pack keeps are the same library rows;
 * - a question reworded only in punctuation gets its exact new words (the old row archived), so an audit asks the
 *   pack byte for byte;
 * - a pack the library can't hold (a question over 200 characters, or two with the same compared text) leaves the
 *   brand with no current set, so its audits fall back to the stored pack (lib/audit/get-audit-prompts.ts).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isBrandedPrompt } from "@/lib/audit/flag-branded-prompts";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
const ORG = randomUUID();
const BRAND = {
  id: randomUUID(),
  name: "Wren Home Services",
  domain: "wrenhome.example.com.au",
  aliases: ["Wren Handy"],
};

const PACK = [
  "Who is the best handyman in Chatswood?",
  "Recommend a reliable handyman near Chatswood",
  "Is Wren Home Services a good choice for a handyman in Chatswood?",
  "Is Wren Handy reputable?",
  "Is wrenhome.example.com.au a real business?",
];

async function write(pack: readonly string[]) {
  const { serviceDb } = await import("@/db/client");
  const { writeSetFromPack } = await import("@/lib/questions/question-set-store");
  return serviceDb.transaction((tx) =>
    writeSetFromPack(tx, { brandId: BRAND.id, pack, note: "test" }),
  );
}

async function current() {
  const { serviceDb } = await import("@/db/client");
  const { loadCurrentQuestionSet } = await import("@/lib/questions/question-set-store");
  return loadCurrentQuestionSet(serviceDb, BRAND.id);
}

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`set-store-${ORG}`}, 'Set Store Org', ${`set-store-${ORG}`})`;
  await sql`INSERT INTO brands (id, organization_id, name, domain, vertical, region, aliases)
    VALUES (${BRAND.id}, ${ORG}, ${BRAND.name}, ${BRAND.domain}, 'tradies', 'au', ${BRAND.aliases})`;
});

afterAll(async () => {
  await sql`DELETE FROM brand_question_set_items WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brand_question_sets WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brand_questions WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  await sql.end();
});

describe("writeSetFromPack", () => {
  it("version 1: the pack in order, each kind isBrandedPrompt's (name, alias, domain), source original, reach local", async () => {
    expect(await write(PACK)).toMatchObject({ written: true, version: 1 });
    const set = await current();
    expect(set?.items.map((i) => i.text)).toEqual(PACK);
    for (const item of set?.items ?? []) {
      expect(item.kind, item.text).toBe(isBrandedPrompt(item.text, BRAND) ? "branded" : "everyday");
    }
    expect(set?.items.map((i) => i.kind)).toEqual([
      "everyday",
      "everyday",
      "branded",
      "branded",
      "branded",
    ]);
    const rows = await sql<{ source: string; reach: string; status: string }[]>`
      SELECT DISTINCT source, reach, status FROM brand_questions WHERE brand_id = ${BRAND.id}`;
    expect(rows).toEqual([{ source: "original", reach: "local", status: "ready" }]);
  });

  it("version 2: current in turn; kept questions are the same rows; a punctuation-only rewording gets its exact words", async () => {
    const before = await current();
    const reworded = "Who is the best handyman -- in Chatswood";
    const next = [
      reworded,
      ...PACK.slice(1, 3),
      "Which handyman in Chatswood offers fixed prices?",
    ];
    expect(await write(next)).toMatchObject({ written: true, version: 2 });
    const set = await current();
    expect(set?.items.map((i) => i.text)).toEqual(next);
    expect(set?.items[1].questionId).toBe(before?.items[1].questionId);
    expect(set?.items[0].questionId).not.toBe(before?.items[0].questionId);
    const [old] = await sql<{ status: string; archived: boolean }[]>`
      SELECT status, archived_at IS NOT NULL AS archived FROM brand_questions WHERE id = ${before?.items[0].questionId ?? ""}`;
    expect(old).toEqual({ status: "archived", archived: true });
    const sets = await sql<{ version: number; is_current: boolean }[]>`
      SELECT version, is_current FROM brand_question_sets WHERE brand_id = ${BRAND.id} ORDER BY version`;
    expect(sets).toEqual([
      { version: 1, is_current: false },
      { version: 2, is_current: true },
    ]);
  });

  it("a question over 200 characters: no current set, so audits ask the stored pack", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(
      await write([...PACK, `Who is the best handyman ${"near Chatswood ".repeat(20)}?`]),
    ).toEqual({
      written: false,
      reason: "question_length",
    });
    expect(await current()).toBeNull();
    expect(warn.mock.calls.some((c) => String(c[0]).includes("question_set_not_written"))).toBe(
      true,
    );
    warn.mockRestore();
  });

  it("two questions with the same compared text: no current set either", async () => {
    expect(await write(PACK)).toMatchObject({ written: true, version: 3 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await write([...PACK, "WHO is the best handyman in Chatswood"])).toEqual({
      written: false,
      reason: "duplicate_question",
    });
    expect(await current()).toBeNull();
    warn.mockRestore();
  });
});
