import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, generatedReports } from "@/db/schema";
import { reportFileName } from "@/lib/communication/report-file-name";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { loadTierNames } from "@/lib/reports/report-tier-choice";
import { isReportTier } from "@/lib/reports/report-tiers";
import type { StorageAdapter } from "@/lib/storage";

/**
 * S01 part 12 (LLD 8.1.6, 8.1.7; contract P13): the client portal's reports -- the generated reports with a stored PDF
 * for the portal's brand, newest first, each with its report type's name (from its snapshot, so a later rename never
 * changes it; reports from before tiers read the workspace's Basic name), its period, the audit it's based on, the
 * Visibility it printed (from the snapshot; none for older reports), when it was made, and a short-lived signed link
 * to the PDF (the existing storage pattern; never a public bucket). Read under the invite's workspace RLS context.
 */

/** How long a portal download link works: "This download link has expired. Try again." after it. */
export const PORTAL_LINK_SECONDS = 10 * 60;

export interface PortalReportRow {
  id: string;
  tierName: string;
  periodLabel: string | null;
  basisAuditNumber: number | null;
  /** The headline the PDF printed, as a whole percentage; null when the report has no snapshot. */
  visibilityPct: number | null;
  generatedAt: string;
  /** Null when the link couldn't be signed just now (the row still lists). */
  downloadUrl: string | null;
}

export async function loadPortalReports(
  tx: DbClient,
  input: {
    organizationId: string;
    brandId: string;
    /** S01C part 5a: names each download (reportFileName). */
    brandName: string;
    storage: StorageAdapter | null;
  },
): Promise<PortalReportRow[]> {
  const rows = await tx
    .select({
      id: generatedReports.id,
      pdfUrl: generatedReports.pdfUrl,
      periodLabel: generatedReports.periodLabel,
      reportTier: generatedReports.reportTier,
      createdAt: generatedReports.createdAt,
      // Only the three fields shown, never the snapshot itself (the PDF's render input).
      tierName: sql<string | null>`${generatedReports.contentsSnapshot}->>'tierName'`,
      mentioned: sql<string | null>`${generatedReports.contentsSnapshot}->'headline'->>'mentioned'`,
      answers: sql<string | null>`${generatedReports.contentsSnapshot}->'headline'->>'answers'`,
      auditNumber: audits.auditNumber,
    })
    .from(generatedReports)
    .leftJoin(audits, eq(audits.id, generatedReports.auditId))
    .where(
      and(
        eq(generatedReports.organizationId, input.organizationId),
        eq(generatedReports.brandId, input.brandId),
        isNotNull(generatedReports.pdfUrl),
      ),
    )
    .orderBy(desc(generatedReports.createdAt))
    .limit(100);
  const names = await loadTierNames(
    tx,
    input.organizationId,
    await effectiveTier(tx, input.organizationId),
  );
  return Promise.all(
    rows.map(async (r) => {
      const tier = isReportTier(r.reportTier) ? r.reportTier : "basic";
      const mentioned = r.mentioned === null ? Number.NaN : Number(r.mentioned);
      const answers = r.answers === null ? Number.NaN : Number(r.answers);
      let downloadUrl: string | null = null;
      if (r.pdfUrl && input.storage) {
        try {
          // S01C part 5a (LLD amendment 64): the portal's download carries the report's name, not its storage id.
          downloadUrl = await input.storage.getDownloadUrl(
            r.pdfUrl,
            PORTAL_LINK_SECONDS,
            reportFileName({
              brandName: input.brandName,
              tierName: r.tierName,
              periodLabel: r.periodLabel,
            }),
          );
        } catch {
          downloadUrl = null;
        }
      }
      return {
        id: r.id,
        tierName: r.tierName ?? names[tier],
        periodLabel: r.periodLabel,
        basisAuditNumber: r.auditNumber ?? null,
        visibilityPct:
          Number.isFinite(mentioned) && Number.isFinite(answers) && answers > 0
            ? Math.round((mentioned / answers) * 100)
            : null,
        generatedAt: r.createdAt.toISOString(),
        downloadUrl,
      };
    }),
  );
}
