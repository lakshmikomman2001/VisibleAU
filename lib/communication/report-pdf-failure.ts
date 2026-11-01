import { STORAGE_MISCONFIGURED } from "@/lib/storage/config-check";
import { STORAGE_UPLOAD_FAILED } from "@/lib/storage/upload-error";
import type { PdfFailureReason } from "./types";

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
