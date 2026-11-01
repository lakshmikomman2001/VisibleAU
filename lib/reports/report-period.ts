import { formatInOrgTimezone, getOrgTimezone } from "@/lib/platform/org-timezone";

export type ReportPeriodType = "weekly" | "monthly";

/**
 * The period a report covers, as a label ("2026-W44", "2026-10"): the one
 * rule every part of the report path uses to decide which audits belong to
 * a period -- the narrative job's choice of basis audit, the PDF's trend
 * section and the manual "Generate report" default.
 *
 * DEMO-BLOCKER (1 Nov), part 5 point 6: the ISO week (or month) of the
 * date in the business's own time zone (Australia/Sydney), whatever the
 * server's -- it was the server's (UTC on Vercel), so an audit finished
 * before 11 am AEDT on a Monday counted in the week before. The year is
 * the ISO week-numbering year ("RRRR"): 29 Dec 2025 is 2026-W01.
 */
export function reportPeriodLabel(
  date: Date,
  periodType: ReportPeriodType,
  organizationId?: string,
): string {
  return formatInOrgTimezone(
    date,
    organizationId,
    periodType === "weekly" ? "RRRR-'W'II" : "yyyy-MM",
  );
}

/** Whether `date` (an audit's completed_at) falls in the report period `label`. */
export function inReportPeriod(
  date: Date,
  label: string,
  periodType: ReportPeriodType,
  organizationId?: string,
): boolean {
  return reportPeriodLabel(date, periodType, organizationId) === label;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface ReportPeriodDisplay {
  /** "Week 44, 2026" or "October 2026". */
  title: string;
  /** "26 Oct – 1 Nov"; null for a month, or a label that isn't a week. */
  range: string | null;
  /** "Week 44, 2026 (26 Oct – 1 Nov)". */
  full: string;
}

/** Monday of ISO week `week` of ISO week-year `year`, as a UTC calendar date. */
function isoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Weekday = jan4.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Weekday - 1) + (week - 1) * 7);
  return monday;
}

function dayMonth(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** How a period label reads in a report: "Week 44, 2026 (26 Oct – 1 Nov)". */
export function reportPeriodDisplay(label: string): ReportPeriodDisplay {
  const week = /^(\d{4})-W(\d{2})$/.exec(label);
  if (week) {
    const year = Number(week[1]);
    const n = Number(week[2]);
    const monday = isoWeekMonday(year, n);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const range =
      monday.getUTCMonth() === sunday.getUTCMonth()
        ? `${monday.getUTCDate()} – ${dayMonth(sunday)}`
        : `${dayMonth(monday)} – ${dayMonth(sunday)}`;
    const title = `Week ${n}, ${year}`;
    return { title, range, full: `${title} (${range})` };
  }
  const month = /^(\d{4})-(\d{2})$/.exec(label);
  if (month) {
    const title = `${MONTHS_LONG[Number(month[2]) - 1]} ${month[1]}`;
    return { title, range: null, full: title };
  }
  return { title: label, range: null, full: label };
}

/** "31 Oct 2026", in the business's own time zone. */
export function reportDate(date: Date, organizationId?: string): string {
  return formatInOrgTimezone(date, organizationId, "d MMM yyyy");
}

/** "31 Oct", in the business's own time zone. */
export function reportShortDate(date: Date, organizationId?: string): string {
  return formatInOrgTimezone(date, organizationId, "d MMM");
}

/** "AEDT" or "AEST" for `date` in the business's own time zone. */
export function timeZoneAbbreviation(date: Date, organizationId?: string): string {
  const part = new Intl.DateTimeFormat("en-AU", {
    timeZone: getOrgTimezone(organizationId),
    timeZoneName: "short",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}

/** "1 Nov 2026, 6:59 pm AEDT" -- when a PDF was generated. */
export function reportDateTime(date: Date, organizationId?: string): string {
  const zone = timeZoneAbbreviation(date, organizationId);
  const local = formatInOrgTimezone(date, organizationId, "d MMM yyyy, h:mm aaa");
  return zone ? `${local} ${zone}` : local;
}
