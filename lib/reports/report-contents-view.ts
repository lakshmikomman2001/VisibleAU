import { eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brands, organizations } from "@/db/schema";
import { loadPrintableAgencyAssets, themeAssetFrom } from "@/lib/branding/agency-assets";
import { isEnabled } from "@/lib/flags/flags";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { TRUST_CHECK_IMPLEMENTED } from "@/lib/trust/stub-implementation-status";
import { auditFindingsData } from "./audit-findings";
import { getBeyondAiAnswers, loadBeyondAiBrand } from "./beyond-ai";
import { checksListRows } from "./enhanced-checks";
import type { WhatToDoNext } from "./report-contents";
import { defaultReportPeriodLabel, selectReportBasis } from "./report-data";
import { reportFindings } from "./report-findings";
import {
  readReportPreferences,
  reportCurationAllowed,
  type SavedReportPreferences,
} from "./report-preferences-service";
import { chooseReportTier, type TierOption, tierOptionsFor } from "./report-tier-choice";
import { type ReportTier, reportTierAllowed } from "./report-tiers";
import { loadWhatToDoNext } from "./what-to-do-next";

/**
 * S01 part 5 (LLD 8.1.3, contract P08): what the report contents panel opens with -- GET
 * /api/brands/:id/report-preferences. With report_v2 off it is `{ enabled: false }` and the Reports page's Generate
 * works exactly as today (no panel). Otherwise: the audit the server will base the report on (selectReportBasis, the
 * generate job's own choice; the panel only shows it), the "What to do next" groups, the saved preferences, whether
 * the plan curates (Agency and up) and the name agency actions are shown under.
 */
export type ReportContentsView =
  | { enabled: false }
  | {
      enabled: true;
      curated: boolean;
      tier: string;
      brandName: string;
      periodLabel: string;
      basis: { auditId: string; auditNumber: number } | null;
      whatToDoNext: WhatToDoNext | null;
      preferences: SavedReportPreferences;
      agencyName: string;
      /** S01 part 8 (P08.tier): the three report types, named and locked for the plan. */
      tiers: TierOption[];
      /** The tier the panel opens on: the brand's last choice when the plan includes it, else the plan's highest. */
      defaultTier: ReportTier;
      /** S01 part 9 (P08.checks): the Enhanced checks with their age and whether they'll be reused or run again. */
      checks: Array<{ key: string; label: string; status: string; willRun: boolean }>;
    };

export async function buildReportContentsView(
  tx: DbClient,
  input: { organizationId: string; brandId: string; now?: Date },
): Promise<ReportContentsView> {
  if (!(await isEnabled("report_v2", input.organizationId))) return { enabled: false };
  const now = input.now ?? new Date();
  const tier = await effectiveTier(tx, input.organizationId);
  const curated = reportCurationAllowed(tier);
  const periodLabel = await defaultReportPeriodLabel(tx, {
    organizationId: input.organizationId,
    brandId: input.brandId,
    periodType: "weekly",
    now,
  });
  const [basis, preferences, assets, [org], [brand], tierChoice] = await Promise.all([
    selectReportBasis(tx, {
      organizationId: input.organizationId,
      brandId: input.brandId,
      periodType: "weekly",
      periodLabel,
    }),
    readReportPreferences(tx, input.brandId),
    loadPrintableAgencyAssets(tx, input.organizationId, input.brandId),
    tx
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId)),
    tx.select({ name: brands.name }).from(brands).where(eq(brands.id, input.brandId)),
    chooseReportTier(tx, {
      organizationId: input.organizationId,
      brandId: input.brandId,
      plan: tier,
    }),
  ]);
  const agencyName =
    themeAssetFrom(assets.brand, assets.workspace)?.agencyName ?? org?.name ?? "your agency";
  let whatToDoNext: WhatToDoNext | null = null;
  if (basis) {
    const data = await auditFindingsData(tx, {
      organizationId: input.organizationId,
      brandId: input.brandId,
      auditId: basis.auditId,
      now,
    });
    whatToDoNext = await loadWhatToDoNext(tx, {
      organizationId: input.organizationId,
      brandId: input.brandId,
      basisAuditId: basis.auditId,
      basisAuditNumber: basis.auditNumber,
      findings: data ? reportFindings(data) : [],
      curated,
      now,
    });
  }
  // Only for a plan that can make an Enhanced report: four indexed reads, the same the report and the refresh use.
  const beyondBrand = reportTierAllowed(tier, "enhanced")
    ? await loadBeyondAiBrand(tx, input.brandId)
    : null;
  const checks = beyondBrand
    ? checksListRows(await getBeyondAiAnswers(tx, { brand: beyondBrand, asOf: now }), now, {
        youtubeEnabled: TRUST_CHECK_IMPLEMENTED.youtubePresence,
        basisAuditNumber: basis?.auditNumber ?? null,
      })
    : [];
  return {
    enabled: true,
    curated,
    tier,
    brandName: brand?.name ?? "",
    periodLabel,
    basis: basis ? { auditId: basis.auditId, auditNumber: basis.auditNumber } : null,
    whatToDoNext,
    preferences,
    agencyName,
    tiers: tierOptionsFor(tier, tierChoice.names),
    defaultTier: tierChoice.tier ?? "basic",
    checks,
  };
}
