/**
 * S01 part 4 (LLD 8.8.5, T7): the platform citations general advice reads, from a real audit's answers -- only
 * successful run-1 everyday answers count, once each (the fixture's own seeding: tests/helpers/report-fixture.ts).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let fx: ReportFixture;

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  fx = await seedReportFixture(sql, {
    brandName: "TechCore IT",
    audits: [
      {
        number: 52,
        completedAt: "2026-11-20T03:00:00.000Z",
        mentions: {},
        directories: { "linkedin.com": 9, "medium.com": 2 },
      },
    ],
  });
}, 60_000);

afterAll(async () => {
  await fx.cleanup();
  await sql.end();
});

describe("loadPlatformCitations", () => {
  it("LinkedIn in 9 of the 40 everyday answers backs its advice; Medium in 2 doesn't", async () => {
    const { serviceDb } = await import("@/db/client");
    const { adviceEvidence, loadPlatformCitations } = await import(
      "@/lib/recommendations/general-advice-evidence"
    );
    const citations = await loadPlatformCitations(serviceDb, fx.audits[52]);
    expect(citations).toEqual({ everydayAnswers: 40, answersCiting: { LinkedIn: 9, Medium: 2 } });
    expect(adviceEvidence({ recommendationKey: "linkedin-presence" }, citations)?.line).toBe(
      "LinkedIn was cited in 9 of 40 answers",
    );
    expect(adviceEvidence({ recommendationKey: "medium-presence" }, citations)).toBeNull();
  });
});
