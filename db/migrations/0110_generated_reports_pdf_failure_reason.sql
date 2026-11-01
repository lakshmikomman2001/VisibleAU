-- Migration 0110 (Vunnara, 1 Nov, "PDF reports fail on production",
-- part 2): a report whose PDF couldn't be made says so.
--
-- Production, 1 Nov 16:51: render-report-pdf failed ("Supabase Storage
-- upload failed: fetch failed") and the report stayed "Generating..."
-- for good -- nothing recorded that the PDF had failed, so the reports
-- pages kept waiting for it.
--
-- generated_reports.pdf_failure_reason: set by inngest/functions/
-- render-report-pdf.ts when the PDF finally fails (after its retries),
-- to a plain category -- never a raw message or a URL:
--   storage_unavailable    file storage couldn't be reached (DNS,
--                          connection, TLS, a timeout)
--   storage_rejected       file storage answered with an error (bucket,
--                          key, permission)
--   storage_misconfigured  a storage setting can't work (checked before
--                          trying)
--   render_error           anything else while building the PDF
-- NULL while it's generating, once it has a PDF, and after "Try again"
-- (POST /api/brands/[brandId]/reports/[reportId]/retry-pdf clears it).
--
-- Nullable, no default, no backfill: every existing row is NULL. A report
-- stuck from before this column is shown as failed after 30 minutes
-- without a PDF (lib/communication/types.ts's deriveReportStatus), so it
-- needs no backfill either.

BEGIN;

ALTER TABLE generated_reports
  ADD COLUMN IF NOT EXISTS pdf_failure_reason text;

DO $$
BEGIN
  ALTER TABLE generated_reports
    ADD CONSTRAINT generated_reports_pdf_failure_reason_check
    CHECK (pdf_failure_reason IN (
      'storage_unavailable', 'storage_rejected', 'storage_misconfigured', 'render_error'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
