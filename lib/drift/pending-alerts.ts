import { and, count, eq, isNull } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brands, driftAlerts } from "@/db/schema";

/**
 * Leftovers task, part 6 (17 Nov; Sri's production check of 16 Nov): drift alerts are counted for live brands only. The
 * agency dashboard's "Pending drift alerts" counted every unacknowledged alert in the workspace, so a deleted brand's
 * alerts stayed in it (production: 3 for the deleted Bondi Plumbing). The drift alerts page already skipped them.
 */
export const OF_LIVE_BRAND = isNull(brands.deletedAt);

/** Unacknowledged drift alerts of the workspace's brands that aren't deleted. */
export async function countPendingDriftAlerts(
  tx: DbClient,
  organizationId: string,
): Promise<number> {
  const [row] = await tx
    .select({ count: count() })
    .from(driftAlerts)
    .innerJoin(brands, eq(driftAlerts.brandId, brands.id))
    .where(
      and(
        eq(driftAlerts.organizationId, organizationId),
        eq(driftAlerts.acknowledged, false),
        OF_LIVE_BRAND,
      ),
    );
  return Number(row?.count ?? 0);
}
