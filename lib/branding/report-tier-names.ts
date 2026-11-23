import { and, desc, eq, isNull } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { agencyBrandAssets } from "@/db/schema";
import type { TierNames } from "@/lib/reports/report-tiers";
import { storedTierNames } from "./report-tier-name-rules";

export {
  reportTierNamesSchema,
  storedTierNames,
  TIER_NAME_MAX,
  TIER_NAME_PROBLEM,
  tierNameProblems,
} from "./report-tier-name-rules";

/**
 * S01 part 10 (LLD 7.5, 8.1.7 D-RT3; contract P18): the names an agency sells its three report types under, on the
 * workspace row of agency_brand_assets (brand_id IS NULL; the newest wins if duplicated). Agency and up; owners and
 * admins (manage_branding). Each name 1-24 characters after trimming, plain text with no line breaks or control
 * characters, the three different ignoring case -- the same rule as the migration's CHECK (report_tier_names_ok).
 * Names apply to reports generated from now on: a report keeps the name in its snapshot.
 */

/**
 * Saves the names on the workspace row (made when the workspace has none yet), under the caller's RLS transaction.
 * Returns whether anything changed (for the audit trail).
 */
export async function saveReportTierNames(
  tx: DbClient,
  organizationId: string,
  names: TierNames | null,
): Promise<boolean> {
  const value = storedTierNames(names);
  const [row] = await tx
    .select({ id: agencyBrandAssets.id, names: agencyBrandAssets.reportTierNames })
    .from(agencyBrandAssets)
    .where(
      and(eq(agencyBrandAssets.organizationId, organizationId), isNull(agencyBrandAssets.brandId)),
    )
    .orderBy(desc(agencyBrandAssets.updatedAt), desc(agencyBrandAssets.id))
    .limit(1);
  if (JSON.stringify(row?.names ?? null) === JSON.stringify(value)) return false;
  if (row) {
    await tx
      .update(agencyBrandAssets)
      .set({ reportTierNames: value, updatedAt: new Date() })
      .where(eq(agencyBrandAssets.id, row.id));
  } else {
    await tx
      .insert(agencyBrandAssets)
      .values({ organizationId, brandId: null, reportTierNames: value });
  }
  return true;
}
