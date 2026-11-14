import { REPORT_PDF_STALLED_MS } from "./types";

/**
 * URGENT audit #38 follow-up (1 Nov) -- how long the reports pages poll
 * for a report's PDF before they stop (lib/hooks/use-safe-poll.ts's
 * maxWaitMs), and what they say then. A PDF normally takes well under a
 * minute (inngest/functions/render-report-pdf.ts).
 *
 * 14 Nov, part 6: past the point a report that never finished is marked failed (REPORT_PDF_STALLED_MS, 10
 * minutes), plus two polls' worth of slack -- so a page left open turns "Generating…" into "Failed" (with
 * Try again) by itself. It used to stop at 10 minutes while that took 30, and stayed at "Generating…".
 *
 * Nothing emails anyone when a report's PDF is ready: render-report-pdf
 * only sets pdfUrl, and send-scheduled-reports emails delivery schedules
 * on its own hourly cron. So the message says to check back, never
 * "we'll email you".
 */
export const REPORT_MAX_WAIT_MS = REPORT_PDF_STALLED_MS + 2 * 60_000;

export const REPORT_TAKING_LONGER_MESSAGE = "Taking longer than expected · please check back later";
