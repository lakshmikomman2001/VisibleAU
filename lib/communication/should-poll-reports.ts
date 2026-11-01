import type { ReportStatus } from "./types";

/**
 * Poll while a report is being made. URGENT PDF reports (1 Nov), part 2:
 * from the status the reports API sends (failed and ready are both
 * terminal), when it's there -- not from whether a download link came
 * back, which is null for a failed report and for a ready one whose link
 * couldn't be signed.
 */
export function shouldPollReports(
  reports: Array<{ pdfUrl: string | null; status?: ReportStatus }>,
  awaitingReport: boolean,
): boolean {
  if (awaitingReport) return true;
  return reports.some((r) => (r.status ? r.status === "generating" : !r.pdfUrl));
}
