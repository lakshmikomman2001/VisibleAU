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

export { type ReportPeriodDisplay, reportPeriodDisplay } from "./period-display";

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
