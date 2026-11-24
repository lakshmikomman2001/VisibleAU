import { eq } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { generatedReports } from "@/db/schema";
import type { ReportSection } from "@/lib/communication/types";
import { TRUST_CHECK_IMPLEMENTED } from "@/lib/trust/stub-implementation-status";
import { getBeyondAiAnswers, loadBeyondAiBrand } from "./beyond-ai";
import { enhancedRunners } from "./enhanced-check-runners";
import type { RefreshOutcome } from "./enhanced-checks";
import { refreshEnhancedChecks } from "./enhanced-refresh";
import { buildReportData } from "./report-data";
import { buildDecidedReportV2 } from "./report-v2";

/**
 * S01B part 1 (LLD amendment 49, D-RT4): the two steps an Enhanced report runs after its row is written -- its stale
 * checks run again, then its contents and snapshot are built as of then. Since S01B they run in their own function,
 * `refresh-enhanced-checks` (one per brand, at most 2 account-wide), so a refresh never holds `POST_AUDIT_POOL`.
 * `generate-narrative-report` sends ENHANCED_CHECKS_REQUESTED once the row is written and is done; the new function
 * runs these two steps and then sends `report/generated`, as the generator did before.
 */

/** The event the generator sends for an Enhanced report once its row is written ("Running checks..." on P17). */
export const ENHANCED_CHECKS_REQUESTED = "report/enhanced-checks-requested";

export interface EnhancedChecksRequest {
  organizationId: string;
  brandId: string;
  reportId: string;
  /** The report's basis audit, chosen when the row was written. */
  auditId: string;
  periodType: "weekly" | "monthly";
  periodLabel: string;
  /** The plan the tier was decided against (the snapshot records the tier's name for it). */
  plan: string;
  /** The default template's sections when the report was generated (null: today's default sections). */
  sections: ReportSection[] | null;
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** The event's data, checked: an event that isn't one of ours is refused rather than half-read. */
export function enhancedChecksRequest(data: unknown): EnhancedChecksRequest {
  const d = (data ?? {}) as Record<string, unknown>;
  const sections = d.sections;
  if (
    !isText(d.organizationId) ||
    !isText(d.brandId) ||
    !isText(d.reportId) ||
    !isText(d.auditId) ||
    (d.periodType !== "weekly" && d.periodType !== "monthly") ||
    !isText(d.periodLabel) ||
    !isText(d.plan) ||
    !(sections === null || sections === undefined || Array.isArray(sections))
  ) {
    throw new Error(`${ENHANCED_CHECKS_REQUESTED}: the event's data isn't a report's`);
  }
  return {
    organizationId: d.organizationId,
    brandId: d.brandId,
    reportId: d.reportId,
    auditId: d.auditId,
    periodType: d.periodType,
    periodLabel: d.periodLabel,
    plan: d.plan,
    sections: (sections as ReportSection[] | null | undefined) ?? null,
  };
}

/** Step one: the stale checks run again through their existing functions, five minutes at most in all (S01 part 9). */
export async function runEnhancedRefresh(
  req: Pick<EnhancedChecksRequest, "organizationId" | "brandId">,
): Promise<RefreshOutcome[]> {
  const { organizationId, brandId } = req;
  const brand = await withRlsContext(organizationId, (tx) => loadBeyondAiBrand(tx, brandId));
  if (!brand) return [];
  return refreshEnhancedChecks({
    brand,
    read: (asOf) => withRlsContext(organizationId, (tx) => getBeyondAiAnswers(tx, { brand, asOf })),
    runners: enhancedRunners(organizationId),
    youtubeEnabled: TRUST_CHECK_IMPLEMENTED.youtubePresence,
  });
}

/** Step two: the report's contents and snapshot, built as of now with the refresh's outcomes, written on its row. */
export async function writeEnhancedSnapshot(
  req: EnhancedChecksRequest,
  outcomes: RefreshOutcome[],
): Promise<void> {
  await withRlsContext(req.organizationId, async (tx) => {
    const data = await buildReportData(tx, {
      organizationId: req.organizationId,
      brandId: req.brandId,
      periodType: req.periodType,
      periodLabel: req.periodLabel,
      auditId: req.auditId,
      sections: req.sections,
    });
    if (!data) throw new Error("The report's basis audit couldn't be read");
    const v2 = await buildDecidedReportV2(tx, {
      data,
      decided: { tier: "enhanced", plan: req.plan },
      now: new Date(),
      refresh: outcomes,
      // S01B part 4: its row is already written; "Done since the last report" counts from the report before it.
      reportId: req.reportId,
    });
    await tx
      .update(generatedReports)
      .set({ contentsSnapshot: v2.snapshot, updatedAt: new Date() })
      .where(eq(generatedReports.id, req.reportId));
  });
}
