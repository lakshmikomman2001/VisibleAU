/**
 * S02 part 1 (LLD 7.1, N2): lib/questions/hash.ts against Postgres itself, on the integration database:
 * - questionTextKey(s) equals SQL's question_text_key(s) (migration 0152) for every mark it handles, Unicode letters,
 *   tabs and line breaks;
 * - computeQuestionSetHash(list) equals SQL's hash of the same list (the expression in migration 0155's backfill and
 *   lib/audit/question-set-sql.ts), including the order of texts COLLATE "C" sorts differently from JS's default;
 * - for seeded audits (tests/helpers/report-fixture.ts: the 0150/0152 audits #47, #48 and #50), the hash the runners
 *   store (questionSetHashSql) equals computeQuestionSetHash of the audit's own everyday prompts.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeQuestionSetHash, questionTextKey } from "@/lib/questions/hash";
import {
  EVERYDAY_QUESTIONS,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

let sql: ReturnType<typeof postgres>;
let fx: ReportFixture;

const TRICKY = [
  "Who is the best plumber -- near Galah?",
  "who is the best plumber — near galah",
  "“Best” tradie’s quote… in Chatswood NSW",
  "Price−list for 24/7 call‐outs [urgent] {today} (please) <now> ~ok~ `x` |y| ^z^",
  "Café Éclair Über Straße near Wren's",
  "  tabs\tand\nnew\r\nlines  and   spaces  ",
  "～ fullwidth wave",
  "\u{1f600} smile first or last?",
  "ALL CAPS QUESTION?!",
  "!!!",
];

async function sqlKey(text: string): Promise<string> {
  const [row] = await sql<{ k: string }[]>`SELECT question_text_key(${text}) AS k`;
  return row.k;
}

/** The backfill's hash expression (migration 0155 run2), over a list. */
async function sqlHash(texts: readonly string[]): Promise<string | null> {
  const [row] = await sql<{ h: string | null }[]>`
    SELECT encode(sha256(convert_to(string_agg(k, E'\n' ORDER BY k COLLATE "C"), 'UTF8')), 'hex') AS h
    FROM (SELECT DISTINCT question_text_key(x) AS k FROM unnest(${texts as string[]}::text[]) AS x) q`;
  return row.h;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  // The 0150/0152 test's audits (tests/integration/question-set.integration.test.tsx): #47 and #48 asked the pack
  // with an off-topic question, #50 without it.
  const v3 = [
    ...EVERYDAY_QUESTIONS,
    "What Australian tech companies are leading in their space in 2025?",
  ];
  fx = await seedReportFixture(sql, {
    brandName: "Wren Home Services",
    audits: [
      {
        number: 47,
        completedAt: "2026-11-10T00:00:00.000Z",
        everydayQuestions: v3,
        mentions: { chatgpt: [1] },
      },
      {
        number: 48,
        completedAt: "2026-11-11T00:00:00.000Z",
        everydayQuestions: v3,
        mentions: { claude: [2] },
      },
      {
        number: 50,
        completedAt: "2026-11-13T00:00:00.000Z",
        everydayQuestions: [...EVERYDAY_QUESTIONS],
        mentions: { gemini: [3] },
      },
    ],
  });
  const { serviceDb } = await import("@/db/client");
  const { audits } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { questionSetHashSql } = await import("@/lib/audit/question-set-sql");
  for (const id of Object.values(fx.audits)) {
    await serviceDb
      .update(audits)
      .set({ questionSetHash: questionSetHashSql(id) })
      .where(eq(audits.id, id));
  }
}, 120_000);

afterAll(async () => {
  await fx.cleanup();
  await sql.end();
});

describe("questionTextKey equals SQL's question_text_key", () => {
  it.each(TRICKY)("%j", async (text) => {
    expect(questionTextKey(text)).toBe(await sqlKey(text));
  });
});

describe("computeQuestionSetHash equals SQL's hash", () => {
  it("for the tricky texts, in any order and with repeats", async () => {
    expect(computeQuestionSetHash(TRICKY)).toBe(await sqlHash(TRICKY));
    const shuffled = [...TRICKY].reverse().concat(TRICKY.slice(0, 3));
    expect(computeQuestionSetHash(shuffled)).toBe(await sqlHash(shuffled));
  });

  it('for texts JS and COLLATE "C" sort differently (an emoji and a fullwidth mark)', async () => {
    const pair = ["～ wave", "\u{1f600} smile"];
    expect(computeQuestionSetHash(pair)).toBe(await sqlHash(pair));
  });

  it("no questions: null in both", async () => {
    expect(computeQuestionSetHash([])).toBeNull();
    expect(await sqlHash([])).toBeNull();
  });

  it("each seeded audit's stored hash equals the TS hash of its own everyday prompts (#47, #48, #50)", async () => {
    for (const [number, id] of Object.entries(fx.audits)) {
      const rows = await sql<{ prompt: string }[]>`
        SELECT prompt FROM citations WHERE audit_id = ${id} AND is_branded_prompt IS NOT TRUE
        UNION SELECT prompt FROM engine_call_failures WHERE audit_id = ${id} AND NOT is_branded_prompt`;
      const [stored] = await sql<{ h: string | null }[]>`
        SELECT question_set_hash AS h FROM audits WHERE id = ${id}`;
      expect(stored.h, `#${number}`).toMatch(/^[0-9a-f]{64}$/);
      expect(computeQuestionSetHash(rows.map((r) => r.prompt)), `#${number}`).toBe(stored.h);
    }
  });
});
