/**
 * "Daily spend cap: count the day in the business's local time, not
 * the database's" -- production evidence (diag-c08, 22 Oct):
 * production's database session timezone is GMT, so the OLD
 * `date_trunc('day', now())` (no explicit zone) started the cap's
 * "day" at 00:00 UTC -- 10-11am in Sydney. Dev's session happens to
 * default to Australia/Sydney, which is why that bug was invisible
 * there.
 *
 * startOfDayInTzSql() (lib/platform/spend-cap-timezone.ts) is the
 * fix: an explicit zone argument, immune to whatever the session
 * timezone happens to be. Proved here by literally setting the
 * session to UTC for one block of assertions and to Australia/Sydney
 * for another, on a connection this file controls directly (never
 * the app's own pooled serviceDb, whose session timezone this file
 * must NOT depend on either way) -- the computed boundary must be
 * identical regardless.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startOfDayInTzSql } from "@/lib/platform/spend-cap-timezone";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
  client = postgres(getTestDatabaseUrl(), { max: 1 });
  db = drizzle(client);
});

afterAll(async () => {
  await client.end();
});

async function boundary(tz: string, now: Date): Promise<Date> {
  const [row] = await db.execute<{ boundary: string }>(
    sql`SELECT ${startOfDayInTzSql(tz, now)} AS boundary`,
  );
  return new Date(row.boundary);
}

async function setSessionTimeZone(tz: string) {
  await client.unsafe(`SET TIME ZONE '${tz}'`);
}

describe("startOfDayInTzSql -- immune to the database session's own timezone", () => {
  // A moment that is 23:30 on 21 Oct 2026 in Sydney (AEDT, UTC+11):
  // 21 Oct 12:30 UTC. And one 1 hour later -- 00:30 on 22 Oct Sydney
  // (a new Sydney calendar day), 21 Oct 13:30 UTC.
  const LATE_21ST_SYDNEY = new Date("2026-10-21T12:30:00.000Z");
  const EARLY_22ND_SYDNEY = new Date("2026-10-21T13:30:00.000Z");

  for (const sessionTz of ["UTC", "Australia/Sydney"]) {
    describe(`with the database session set to ${sessionTz}`, () => {
      it("23:30 Sydney time and 00:30 Sydney time (1 hour later) fall on different Sydney calendar days", async () => {
        await setSessionTimeZone(sessionTz);

        const lateBoundary = await boundary("Australia/Sydney", LATE_21ST_SYDNEY);
        const earlyBoundary = await boundary("Australia/Sydney", EARLY_22ND_SYDNEY);

        // Different day-window starts -- 00:30 on the 22nd has
        // already rolled into the NEXT Sydney day's window.
        expect(earlyBoundary.getTime()).toBeGreaterThan(lateBoundary.getTime());
        // The 23:30 instant's own window start is still BEFORE it
        // (same day, hasn't rolled over yet) -- spend recorded then
        // counts toward THAT Sydney day, not a day that hasn't
        // started.
        expect(lateBoundary.getTime()).toBeLessThanOrEqual(LATE_21ST_SYDNEY.getTime());
        // The 00:30 instant's window start is also before it, but
        // strictly after the 23:30 instant's own window start --
        // proving it's a NEW window, not the same one still open.
        expect(earlyBoundary.getTime()).toBeLessThanOrEqual(EARLY_22ND_SYDNEY.getTime());
        expect(earlyBoundary.getTime()).toBeGreaterThan(lateBoundary.getTime());
      });

      it("the computed boundary for the SAME instant is identical regardless of session timezone", async () => {
        await setSessionTimeZone(sessionTz);
        const result = await boundary("Australia/Sydney", LATE_21ST_SYDNEY);
        // 00:00 on 21 Oct 2026 in Sydney (AEDT, UTC+11) = 20 Oct 2026
        // 13:00:00 UTC -- the one correct answer, whichever session
        // timezone computed it.
        expect(result.toISOString()).toBe("2026-10-20T13:00:00.000Z");
      });
    });
  }
});

describe("startOfDayInTzSql -- correct window length across the AU DST transitions (not a naive always-24h shift)", () => {
  it("DST START (first Sunday of October): the day beginning 2026-10-04 00:00 Sydney is 23 hours long", async () => {
    const startOf4th = await boundary("Australia/Sydney", new Date("2026-10-04T05:00:00.000Z"));
    const startOf5th = await boundary("Australia/Sydney", new Date("2026-10-05T05:00:00.000Z"));
    const hours = (startOf5th.getTime() - startOf4th.getTime()) / 3_600_000;
    expect(hours).toBe(23);
  });

  it("DST END (first Sunday of April): the day beginning 2026-04-05 00:00 Sydney is 25 hours long", async () => {
    const startOf5th = await boundary("Australia/Sydney", new Date("2026-04-05T05:00:00.000Z"));
    const startOf6th = await boundary("Australia/Sydney", new Date("2026-04-06T05:00:00.000Z"));
    const hours = (startOf6th.getTime() - startOf5th.getTime()) / 3_600_000;
    expect(hours).toBe(25);
  });

  it("an ordinary day away from either transition is still exactly 24 hours", async () => {
    const startOfDay = await boundary("Australia/Sydney", new Date("2026-06-15T05:00:00.000Z"));
    const startOfNextDay = await boundary("Australia/Sydney", new Date("2026-06-16T05:00:00.000Z"));
    const hours = (startOfNextDay.getTime() - startOfDay.getTime()) / 3_600_000;
    expect(hours).toBe(24);
  });
});

// ---------------------------------------------------------------------
// End-to-end: BudgetPolicyService.checkDailySpend() itself (not just
// the extracted helper), against a REAL seeded audit_cost_snapshots
// row, proving the literal business behaviour the brief describes:
// "spend recorded at 23:30 Sydney time counts toward that Sydney day;
// spend at 00:30 Sydney the next day starts a new window." Session-
// timezone independence is already proved above at the SQL-expression
// level, so this block doesn't need to vary it again.
// ---------------------------------------------------------------------
describe("BudgetPolicyService.checkDailySpend() -- 23:30 Sydney counts; 00:30 Sydney the next day doesn't", () => {
  const ORG_ID = randomUUID();
  const BRAND_ID = randomUUID();
  const AUDIT_ID = randomUUID();
  // $150 AU (well over a $100 test cap) recorded at 23:30 Sydney on
  // 21 Oct 2026 -- 2026-10-21T12:30:00.000Z.
  const LATE_21ST_SYDNEY = new Date("2026-10-21T12:30:00.000Z");
  const TEST_CAP_CENTS = 10_000; // AU$100, same as the real default

  beforeAll(async () => {
    await client`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${ORG_ID}, ${`spend-tz-${ORG_ID}`}, 'Spend TZ Test Org', ${`spend-tz-org-${ORG_ID}`})
    `;
    await client`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
      VALUES (${BRAND_ID}, ${ORG_ID}, 'Spend TZ Co', 'spendtz.example.com.au', 'tradies', 'au', ARRAY[]::text[])
    `;
    await client`
      INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, completed_at)
      VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'manual', 'complete', ${LATE_21ST_SYDNEY.toISOString()})
    `;
    await client`
      INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale, estimated_cost_cents, actual_cost_cents, prompt_count, provider_call_count, created_at)
      VALUES (${AUDIT_ID}, ${ORG_ID}, 'AU_EN', 'en-AU', 0, 15000, 0, 0, ${LATE_21ST_SYDNEY.toISOString()})
    `;
  });

  afterAll(async () => {
    await client`DELETE FROM audit_cost_snapshots WHERE organization_id = ${ORG_ID}`;
    await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
    await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
    await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  });

  it("checking at 23:45 Sydney (same Sydney day as the spend) sees it -- cap exceeded", async () => {
    const { BudgetPolicyService } = await import("@/lib/platform/budget-policy.service");
    const result = await BudgetPolicyService.checkDailySpend(
      ORG_ID,
      TEST_CAP_CENTS,
      new Date("2026-10-21T12:45:00.000Z"), // 23:45 Sydney, 21 Oct
    );
    expect(result.spentTodayCents).toBe(15000);
    expect(result.allowed).toBe(false);
  });

  it("checking at 00:30 Sydney the NEXT day no longer sees it -- a fresh window, cap no longer exceeded ('audits resume after midnight')", async () => {
    const { BudgetPolicyService } = await import("@/lib/platform/budget-policy.service");
    const result = await BudgetPolicyService.checkDailySpend(
      ORG_ID,
      TEST_CAP_CENTS,
      new Date("2026-10-21T13:30:00.000Z"), // 00:30 Sydney, 22 Oct
    );
    expect(result.spentTodayCents).toBe(0);
    expect(result.allowed).toBe(true);
  });
});
