/**
 * URGENT audit #38 follow-up (1 Nov) -- how long the reports pages poll
 * for a report's PDF before they stop (lib/hooks/use-safe-poll.ts's
 * maxWaitMs), and what they say then. A PDF normally takes well under a
 * minute (inngest/functions/render-report-pdf.ts).
 *
 * Nothing emails anyone when a report's PDF is ready: render-report-pdf
 * only sets pdfUrl, and send-scheduled-reports emails delivery schedules
 * on its own hourly cron. So the message says to check back, never
 * "we'll email you".
 */
export const REPORT_MAX_WAIT_MS = 10 * 60_000;

export const REPORT_TAKING_LONGER_MESSAGE = "Taking longer than expected · please check back later";
