/**
 * Leftovers task, part 6 (17 Nov; Sri's production check of 16 Nov): the wins feed's "visibility up" is the brand's
 * latest audit against the one before, as the audit pages count them (lib/visibility/audit-change.ts) -- only when
 * the two are comparable (the same methodology, models and everyday questions) and the figure rose. It compared the
 * two newest weekly trend rows (visibility_trends), whose definitions aren't the audit page's (distinct questions
 * pooled across a week, unverified mentions counted: Hero W46 81.82 while its audit page said 33%).
 *
 * Real DB: a workspace per case, each with two audits.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EVERYDAY_QUESTIONS,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

let client: ReturnType<typeof postgres>;
const fixtures: ReportFixture[] = [];

/** Two audits a week apart; `mentions` is how many of the 10 ChatGPT answers named the brand in each. */
async function twoAudits(
  name: string,
  before: number,
  after: number,
  later: {
    methodologyVersion?: number;
    models?: { chatgpt: string };
    everydayQuestions?: string[];
  } = {},
) {
  const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const fx = await seedReportFixture(client, {
    brandName: name,
    audits: [
      { number: 49, completedAt: "2026-11-08T03:00:00.000Z", mentions: { chatgpt: range(before) } },
      {
        number: 50,
        completedAt: "2026-11-15T03:00:00.000Z",
        mentions: { chatgpt: range(after) },
        ...later,
      },
    ],
  });
  fixtures.push(fx);
  // What both audit runners do when they mark an audit complete: stamp its question set (lib/audit/question-set-sql.ts).
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
  return fx;
}

async function visibilityUps(fx: ReportFixture) {
  const { withRlsContext } = await import("@/db/client");
  const { getWinsFeed } = await import("@/lib/communication/wins-feed");
  const wins = await withRlsContext(fx.orgId, (tx) => getWinsFeed(tx, fx.brandId));
  return wins.filter((w) => w.type === "visibility_up");
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
}, 60_000);

afterAll(async () => {
  for (const fx of fixtures) await fx.cleanup();
  await client.end();
});

describe("the wins feed's 'visibility up' compares the audits themselves", () => {
  it("a rise between comparable audits: the audits' own figures, with counts and audit numbers", async () => {
    const fx = await twoAudits("Rising Plumbing", 3, 6);
    const ups = await visibilityUps(fx);
    expect(ups).toHaveLength(1);
    expect(ups[0].headline).toMatch(/^Visibility up \d+ points?$/);
    expect(ups[0].reason).toMatch(
      /^Audit #49 → #50: \d+% \(\d+ of \d+\) → \d+% \(\d+ of \d+\), up \d+ points?$/,
    );
    expect(ups[0].metricDelta).toBeGreaterThan(0);
    expect(JSON.stringify(ups)).not.toMatch(/Mention rate up|likely linked to/);
  }, 60_000);

  it("a drop, or no change: no win", async () => {
    expect(await visibilityUps(await twoAudits("Falling Plumbing", 6, 3))).toEqual([]);
    expect(await visibilityUps(await twoAudits("Steady Plumbing", 4, 4))).toEqual([]);
  }, 60_000);

  it("across a methodology change, a model change or a change of questions: no win, however it rose", async () => {
    expect(
      await visibilityUps(await twoAudits("New Method Plumbing", 3, 6, { methodologyVersion: 3 })),
    ).toEqual([]);
    expect(
      await visibilityUps(
        await twoAudits("New Model Plumbing", 3, 6, { models: { chatgpt: "gpt-5-test" } }),
      ),
    ).toEqual([]);
    expect(
      await visibilityUps(
        await twoAudits("New Questions Plumbing", 3, 6, {
          everydayQuestions: [
            ...EVERYDAY_QUESTIONS.slice(0, 9),
            "Which plumber in Castle Hill fixes hot water systems?",
          ],
        }),
      ),
    ).toEqual([]);
  }, 120_000);
});
