import { getStorage, type StorageAdapter } from "@/lib/storage";
import { deriveReportStatus, type ReportStatus } from "./types";

interface StoredReport {
  id: string;
  /** The storage path, once render-report-pdf uploaded the PDF. */
  pdfUrl: string | null;
  emailSentAt: Date | null;
  pdfFailureReason: string | null;
  updatedAt: Date;
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
): Promise<
  Omit<T, "pdfUrl"> & { pdfUrl: string | null; pdfLinkUnavailable: boolean; status: ReportStatus }
> {
  let link: string | null = null;
  let pdfLinkUnavailable = false;
  if (report.pdfUrl) {
    try {
      if (!storage) throw new Error("storage isn't available");
      link = await storage.getDownloadUrl(report.pdfUrl);
    } catch {
      pdfLinkUnavailable = true;
    }
  }
  return {
    ...report,
    pdfUrl: link,
    pdfLinkUnavailable,
    status: deriveReportStatus(report.pdfUrl, report.emailSentAt, {
      failureReason: report.pdfFailureReason,
      updatedAt: report.updatedAt,
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
