/**
 * "22 Nov 2026": the app's short date, in Sydney time -- a check's date as the Beyond AI answers tiles print it (S01
 * part 6), the findings' evidence lines since S01B part 6e (LLD amendment 56; never "2026-11-22"), and since S02 part
 * 0B (amendment 73) the Reports page's dates (it printed "25/11/2026"). It lives here, with no server imports, so a
 * client page can use it; lib/reports/report-format.ts re-exports it.
 */
export function formatCheckDate(iso: string, timeZone = "Australia/Sydney"): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
}
