import { and, desc, eq, isNull } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { agencyBrandAssets, brands } from "@/db/schema";
import { isEnabled } from "@/lib/flags/flags";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { getBeyondAiAnswers } from "./beyond-ai";
import type { ReportData } from "./report-data";
import { reportFindings } from "./report-findings";
import { reportCurationAllowed } from "./report-preferences-service";
import {
  buildReportSnapshot,
  type ReportDataV2,
  type ReportSnapshot,
  type ReportV2,
} from "./report-snapshot";
import { pagesForTier, planNamesTiers, type ReportTier, tierNamesFrom } from "./report-tiers";
import { loadWhatToDoNext } from "./what-to-do-next";

/**
 * S01 parts 7-8 (LLD 8.1.2, 8.1.3, 8.1.4, 8.1.7): a report's v2 contents for its tier, read with the same functions as
 * the audit page and the panel (no second calculation): "What to do next" for Standard and Enhanced, "Beyond AI answers"
 * for Enhanced (as of the report's own time), the tier's page set and name, and the question mix. Called only while
 * report_v2 is on; the caller has already checked the tier against the plan.
 */
export async function buildReportV2(
  db: DbClient,
  input: { data: ReportData; tier: ReportTier; now: Date },
): Promise<ReportV2> {
  const { data, tier, now } = input;
  const organizationId = data.organizationId;
  const plan = await effectiveTier(db, organizationId);
  const [[brand], [branding]] = await Promise.all([
    db
      .select({
        id: brands.id,
        name: brands.name,
        domain: brands.domain,
        region: brands.region,
        categories: brands.categories,
        abn: brands.abn,
        youtubeChannelUrl: brands.youtubeChannelUrl,
        suburb: brands.suburb,
        state: brands.state,
        postcode: brands.postcode,
      })
      .from(brands)
      .where(eq(brands.id, data.brand.id)),
    db
      .select({ names: agencyBrandAssets.reportTierNames })
      .from(agencyBrandAssets)
      .where(
        and(
          eq(agencyBrandAssets.organizationId, organizationId),
          isNull(agencyBrandAssets.brandId),
        ),
      )
      // The workspace row (brand_id IS NULL); the newest wins if duplicated (lib/branding/agency-assets.ts's order).
      .orderBy(desc(agencyBrandAssets.updatedAt), desc(agencyBrandAssets.id))
      .limit(1),
  ]);
  const names = tierNamesFrom(branding?.names, plan);
  const withActions = tier !== "basic";
  const [whatToDoNext, beyondAi] = await Promise.all([
    withActions
      ? loadWhatToDoNext(db, {
          organizationId,
          brandId: data.brand.id,
          basisAuditId: data.basis.auditId,
          basisAuditNumber: data.basis.auditNumber,
          findings: reportFindings(data),
          curated: reportCurationAllowed(plan),
          now,
        })
      : Promise.resolve(null),
    tier === "enhanced" && brand
      ? getBeyondAiAnswers(db, {
          brand: { ...brand, categories: brand.categories ?? [] },
          asOf: now,
          basisAuditId: data.basis.auditId,
        })
      : Promise.resolve(null),
  ]);
  return {
    tier,
    tierLabel: names[tier],
    coverTierName: planNamesTiers(plan) ? names[tier] : null,
    sections: pagesForTier(tier),
    whatToDoNext,
    beyondAi,
    agencyName: data.agency.name,
    questionMix: {
      everyday: data.questions.everyday,
      branded: data.questions.branded,
      bySource: { original: data.questions.everyday },
    },
  };
}

/**
 * At generation (generate-narrative-report): while report_v2 is on, the report's v2 contents for its tier and the
 * snapshot to store on the row; off, null -- the report is today's, with no snapshot, and renders as today.
 */
export async function reportV2ForGeneration(
  db: DbClient,
  input: { data: ReportData; tier: ReportTier; now: Date },
): Promise<{ tier: ReportTier; data: ReportDataV2; snapshot: ReportSnapshot } | null> {
  if (!(await isEnabled("report_v2", input.data.organizationId))) return null;
  const v2 = await buildReportV2(db, input);
  const data: ReportDataV2 = { ...input.data, v2 };
  return { tier: input.tier, data, snapshot: buildReportSnapshot(data) };
}
