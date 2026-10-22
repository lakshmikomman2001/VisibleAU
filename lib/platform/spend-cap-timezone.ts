import { sql, type SQL } from "drizzle-orm";

/**
 * "Daily spend cap: count the day in the business's local time, not
 * the database's" -- production evidence (diag-c08, 22 Oct): prod's
 * database session timezone is GMT, so `date_trunc('day', now())`
 * (no explicit zone) started the cap's "day" at 00:00 UTC, 10-11am in
 * Sydney. Dev's session happens to default to Australia/Sydney, which
 * is why that bug was invisible there. Every caller of
 * getSpendCapTimezone()/startOfDayInTzSql() below is immune to
 * whatever timezone a given database session (or environment)
 * happens to default to -- the zone is always an explicit argument,
 * never ambient state.
 *
 * Build 2: the AU market pack will supply a per-market zone (e.g.
 * "America/New_York" for a US market) instead of this one constant
 * every org gets today. getSpendCapTimezone() already takes
 * organizationId so no call site needs to change when that lookup is
 * built -- not built now, per the brief.
 */
export const AU_SPEND_CAP_TIMEZONE = "Australia/Sydney";

export function getSpendCapTimezone(_organizationId?: string): string {
  return AU_SPEND_CAP_TIMEZONE;
}

/**
 * The UTC instant that is local midnight, on `now`'s local calendar
 * day in `tz`. `now` is always an explicit argument (never Postgres's
 * own now()) so this is deterministic and testable without touching
 * the wall clock.
 *
 * AT TIME ZONE with an explicit zone name (not a UTC offset) is what
 * makes this immune to the session's own timezone setting in BOTH
 * directions: applied to `now`'s timestamptz value it first converts
 * to the wall-clock time IN `tz` (so date_trunc('day', ...) truncates
 * the right calendar day), then applied to that wall-clock value it
 * converts back to the correct UTC instant for midnight in `tz` --
 * correctly 23 or 25 hours after the PREVIOUS midnight on the two
 * Australian DST transition days (first Sunday of October / April),
 * never a naive, always-24h offset shift. Confirmed directly against
 * Postgres's own tz database: 2026-10-04 -> 2026-10-05 is a 23h day,
 * 2026-04-05 -> 2026-04-06 is a 25h day.
 */
export function startOfDayInTzSql(tz: string, now: Date): SQL {
  // Passed as an ISO string, not a raw Date: drizzle knows how to
  // encode a Date for a real column reference, but has no column
  // metadata to encode one against a bare position inside a raw
  // sql`` expression like this -- the postgres.js driver then rejects
  // the bound Date outright ("the 'string' argument must be...
  // Received an instance of Date"), same reasoning as lib/audit/
  // stale-audit-guard.ts's matching comment.
  return sql`(date_trunc('day', ${now.toISOString()}::timestamptz AT TIME ZONE ${tz}) AT TIME ZONE ${tz})`;
}
