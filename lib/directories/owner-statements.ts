import { inArray } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brandDirectoryListings } from "@/db/schema";
import type { OwnerDirectoryStatement } from "@/lib/recommendations/confidence-labels";

/** Each brand's own directory statements, keyed by brandId. `tx` must be RLS-scoped to the org. */
export async function getOwnerDirectoryStatements(
  tx: DbClient,
  brandIds: readonly string[],
): Promise<Map<string, OwnerDirectoryStatement[]>> {
  const byBrand = new Map<string, OwnerDirectoryStatement[]>();
  if (brandIds.length === 0) return byBrand;
  const rows = await tx
    .select({
      brandId: brandDirectoryListings.brandId,
      directoryKey: brandDirectoryListings.directoryKey,
      status: brandDirectoryListings.status,
    })
    .from(brandDirectoryListings)
    .where(inArray(brandDirectoryListings.brandId, [...brandIds]));
  for (const { brandId, directoryKey, status } of rows) {
    const statements = byBrand.get(brandId) ?? [];
    statements.push({ directoryKey, status });
    byBrand.set(brandId, statements);
  }
  return byBrand;
}
