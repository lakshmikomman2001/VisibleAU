import { getStorage, type StorageAdapter } from "@/lib/storage";
import { deriveReportStatus, type ReportStatus } from "./types";

interface StoredReport {
  id: string;
  /** The storage path, once render-report-pdf uploaded the PDF. */
  pdfUrl: string | null;
  emailSentAt: Date | null;
  pdfFailureReason: string | null;
  /** Migration 0149: the failure's message, for the operator only -- never returned (see reportForPage). */
  pdfFailureDetail?: string | null;
  updatedAt: Date;
  /** S01: the report's tier (migration 0154); "basic" for every report before tiers. */
  reportTier?: string;
  /**
   * S01: the contents snapshot -- never sent to a page (it's the PDF's render input). A list may select only whether
   * one is stored (`hasSnapshot`) instead of the snapshot itself.
   */
  contentsSnapshot?: unknown;
  hasSnapshot?: boolean;
}

/**
 * URGENT PDF reports (1 Nov), part 2 -- one report as the reports pages
 * get it: the storage path swapped for a signed download link, and the
 * status worked out from what's stored (failed included), not from
 * whether a link could be signed. Before this, a link that couldn't be
 * signed (storage unreachable) came back as pdfUrl null, and the pages
 * showed a report that HAS a PDF as "Generating..." and kept polling for
 * it. Now that's `pdfLinkUnavailable`, and its status stays ready.
 */
export async function reportForPage<T extends StoredReport>(
  report: T,
  storage: StorageAdapter | null,
  /** S01C part 5a: the name its download is saved under (reportFileName). */
  fileName?: string,
): Promise<
  Omit<T, "pdfUrl" | "pdfFailureDetail" | "contentsSnapshot" | "hasSnapshot"> & {
    pdfUrl: string | null;
    pdfLinkUnavailable: boolean;
    status: ReportStatus;
  }
> {
  let link: string | null = null;
  let pdfLinkUnavailable = false;
  if (report.pdfUrl) {
    try {
      if (!storage) throw new Error("storage isn't available");
      link = await storage.getDownloadUrl(report.pdfUrl, undefined, fileName);
    } catch {
      pdfLinkUnavailable = true;
    }
  }
  // 14 Nov, part 6: why a PDF failed, in the provider's words (a hostname, a status), is for the operator's
  // /admin/reports; the customer sees the category's plain words (pdfFailureLabel).
  const {
    pdfFailureDetail: _operatorOnly,
    pdfUrl: _storagePath,
    contentsSnapshot: _renderInput,
    hasSnapshot: _hasSnapshot,
    ...shown
  } = report;
  // S01 part 9: an Enhanced report is written before its checks are refreshed; until its contents are, it's
  // "Running checks..." (P17).
  const snapshotStored =
    report.hasSnapshot ??
    (report.contentsSnapshot !== undefined && report.contentsSnapshot !== null);
  const runningChecks =
    report.reportTier === "enhanced" &&
    !snapshotStored &&
    (report.hasSnapshot !== undefined || report.contentsSnapshot !== undefined);
  return {
    ...shown,
    pdfUrl: link,
    pdfLinkUnavailable,
    status: deriveReportStatus(report.pdfUrl, report.emailSentAt, {
      failureReason: report.pdfFailureReason,
      updatedAt: report.updatedAt,
      runningChecks,
    }),
  };
}

/** getStorage(), or null when its settings are missing -- the reports still list. */
export function storageOrNull(): StorageAdapter | null {
  try {
    return getStorage();
  } catch {
    return null;
  }
}

/** One line per request when PDFs exist but their links couldn't be signed -- no paths or URLs. */
export function warnUnavailableLinks(
  route: string,
  reports: Array<{ id: string; pdfLinkUnavailable: boolean }>,
): void {
  const unavailable = reports.filter((r) => r.pdfLinkUnavailable).length;
  if (unavailable > 0) {
    console.warn(JSON.stringify({ event: "report_pdf_link_unavailable", route, unavailable }));
  }
}
