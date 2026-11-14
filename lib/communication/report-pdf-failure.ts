import { STORAGE_MISCONFIGURED } from "@/lib/storage/config-check";
import { redactSecrets } from "@/lib/storage/redact";
import { STORAGE_UPLOAD_FAILED } from "@/lib/storage/upload-error";
import { type PdfFailureReason, REPORT_PDF_STALLED_MINUTES } from "./types";

/**
 * URGENT PDF reports (1 Nov), part 2 -- the category recorded when
 * render-report-pdf's render-and-upload step finally fails, read from the
 * error's message (Inngest hands the handler the step's error with its
 * original message; lib/storage writes these prefixes):
 * - "Storage is misconfigured: ..." -> storage_misconfigured (no attempt made)
 * - "Supabase Storage upload failed: HTTP 4xx ..." -> storage_rejected (storage answered)
 * - "Supabase Storage upload failed: ..." -> storage_unavailable (no answer: DNS,
 *   connection, TLS, a timeout)
 * - anything else -> render_error
 */
export function pdfFailureReasonFor(message: string): PdfFailureReason {
  if (message.includes(STORAGE_MISCONFIGURED)) return "storage_misconfigured";
  if (message.includes(`${STORAGE_UPLOAD_FAILED}: HTTP `)) return "storage_rejected";
  if (message.includes(STORAGE_UPLOAD_FAILED)) return "storage_unavailable";
  return "render_error";
}

/** The ones Sri needs to hear about without opening Inngest: a storage problem is never the report's own. */
export function isStorageFailure(reason: PdfFailureReason): boolean {
  return reason !== "render_error";
}

/** How long a stored failure message may be (generated_reports.pdf_failure_detail, migration 0149). */
export const PDF_FAILURE_DETAIL_MAX = 600;

/**
 * 14 Nov, part 6 -- the failure's own message as stored for the operator: secrets stripped (URLs, keys, tokens;
 * a bare hostname stays, it says which project), on one line, at most PDF_FAILURE_DETAIL_MAX characters.
 */
export function pdfFailureDetailFor(message: string): string {
  return redactSecrets(message).replace(/\s+/g, " ").trim().slice(0, PDF_FAILURE_DETAIL_MAX);
}

/** What the operator reads for each category (the customer's words are PDF_FAILURE_LABELS). */
export const PDF_FAILURE_OPERATOR_LABELS: Record<PdfFailureReason, string> = {
  storage_unavailable: "Storage unavailable",
  storage_rejected: "Storage refused the upload",
  storage_misconfigured: "Storage misconfigured",
  render_error: "The PDF couldn't be built",
};

/** A report that stopped changing with no failure recorded (deriveReportStatus's timeout). */
export const PDF_STALLED_OPERATOR_LABEL = `Didn't finish within ${REPORT_PDF_STALLED_MINUTES} minutes, and no failure was recorded`;

/** The likely cause, read from the stored message; null when it doesn't say. */
export function pdfFailureCause(detail: string | null | undefined): string | null {
  if (!detail) return null;
  if (/\b(ENOTFOUND|EAI_AGAIN)\b|getaddrinfo/.test(detail)) {
    return /supabase\.(co|in)\b/i.test(detail)
      ? "Supabase project paused or unreachable"
      : "the storage host's name doesn't resolve";
  }
  if (/\bECONNREFUSED\b/.test(detail)) return "the connection was refused";
  if (/\b(ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT)\b|timed out/i.test(detail)) {
    return "no answer in time";
  }
  const http = detail.match(/\bHTTP (\d{3})\b/);
  if (http) return `storage answered HTTP ${http[1]}`;
  return null;
}

/** "Storage unavailable (Supabase project paused or unreachable)", for /admin/reports. */
export function pdfFailureOperatorLine(
  reason: PdfFailureReason | null,
  detail: string | null | undefined,
): string {
  if (reason === null) return PDF_STALLED_OPERATOR_LABEL;
  const cause = pdfFailureCause(detail);
  return `${PDF_FAILURE_OPERATOR_LABELS[reason]}${cause ? ` (${cause})` : ""}`;
}
