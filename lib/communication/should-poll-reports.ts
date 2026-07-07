export function shouldPollReports(
  reports: Array<{ pdfUrl: string | null }>,
  awaitingReport: boolean,
): boolean {
  if (awaitingReport) return true;
  return reports.some((r) => !r.pdfUrl);
}
