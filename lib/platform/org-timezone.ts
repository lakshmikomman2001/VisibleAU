import { format } from "date-fns";
import { sql, type SQL } from "drizzle-orm";

/**
 * "Daily spend cap: count the day in the business's local time, not
 * the database's" -- production evidence (diag-c08, 22 Oct): prod's
 * database session timezone is GMT, so `date_trunc('day', now())`
 * (no explicit zone) started the cap's "day" at 00:00 UTC, 10-11am in
 * Sydney. Dev's session happens to default to Australia/Sydney, which
 * is why that bug was invisible there. Every caller of
 * getOrgTimezone()/startOfDayInTzSql()/formatInOrgTimezone() below is
 * immune to whatever timezone a given database session (or runtime
 * environment) happens to default to -- the zone is always an
 * explicit argument, never ambient state.
 *
 * "Dates show in Sydney time" (23 Oct), item 3 -- renamed from this
 * file's original spend-cap-timezone.ts/getSpendCapTimezone() (kept
 * as a plain rename, not a new concept: the function's own body was
 * already generic, just named for its first caller). Reused here for
 * every OTHER owner-facing date/time display that needs the
 * business's own timezone, not just the spend cap.
 *
 * Build 2: the AU market pack will supply a per-market zone (e.g.
 * "America/New_York" for a US market) instead of this one constant
 * every org gets today. getOrgTimezone() already takes
 * organizationId so no call site needs to change when that lookup is
 * built -- not built now, per the brief.
 */
export const AU_ORG_TIMEZONE = "Australia/Sydney";

export function getOrgTimezone(_organizationId?: string): string {
  return AU_ORG_TIMEZONE;
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

/**
 * "Dates show in Sydney time" (23 Oct), item 3 -- every owner-facing
 * date/time on the audit, brand and history pages, emails and the PDF
 * must render in the business's own timezone, not whatever timezone
 * the server process happens to be running under (typically UTC,
 * which can read as the wrong calendar day entirely -- a 21:09 UTC
 * completion is already "tomorrow" in Sydney).
 *
 * No date-fns-tz/@date-fns/tz is installed (confirmed: only plain
 * date-fns ^4.4.0), so this builds on the native, dependency-free
 * Intl.DateTimeFormat, which already fully understands IANA zone
 * names and their real DST rules -- no third-party tz database to
 * keep in sync.
 *
 * The trick: read `date`'s wall-clock fields IN `tz` via
 * Intl.DateTimeFormat, then construct a new Date from those exact
 * numbers using the LOCAL (not UTC) Date constructor. That
 * constructor interprets the numbers as being in the CURRENT
 * runtime's own ambient local zone, whatever that is -- and
 * date-fns' format() below reads a Date back out through that exact
 * same ambient-local lens. The two cancel out: this works correctly
 * regardless of whether the server's own TZ happens to be UTC,
 * Sydney, or anything else, without ever needing to know or assume
 * it. The constructed Date's real UTC instant is meaningless and
 * never used for anything beyond this one format() call.
 *
 * Takes any date-fns pattern string -- every existing call site keeps
 * its own exact pattern (e.g. "d MMM yyyy"), so the visual format is
 * unchanged; only the TIMEZONE the fields are read in changes.
 */
export function formatInOrgTimezone(
  date: Date,
  organizationId: string | undefined,
  pattern: string,
): string {
  const tz = getOrgTimezone(organizationId);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const field = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const hour = field("hour");
  const wallClock = new Date(
    field("year"),
    field("month") - 1,
    field("day"),
    hour === 24 ? 0 : hour, // some engines render midnight as "24", not "00"
    field("minute"),
    field("second"),
  );
  return format(wallClock, pattern);
}
