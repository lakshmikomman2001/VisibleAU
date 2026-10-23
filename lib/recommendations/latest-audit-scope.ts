import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits } from "@/db/schema";

/**
 * "The Action Center shows each brand's latest audit only" (23 Oct),
 * item 1 -- the brand's own most recently COMPLETED audit, one per
 * brand, for every brand in this org. Computed in JS from a plain
 * per-org row fetch rather than a SQL `DISTINCT ON` (not available
 * through this installed drizzle-orm version's query builder, and a
 * raw subquery would be the only other way to express it) -- an org's
 * total audit count is small enough that this is never the expensive
 * part of the page.
 */
export async function latestCompleteAuditIdsByBrand(
  tx: DbClient,
  organizationId: string,
): Promise<string[]> {
  const completeAudits = await tx
    .select({ id: audits.id, brandId: audits.brandId, completedAt: audits.completedAt })
    .from(audits)
    .where(and(eq(audits.organizationId, organizationId), eq(audits.status, "complete")));

  // completedAt ties (two audits for the same brand completing in the
  // same millisecond) are only a theoretical concern, but breaking them
  // by id keeps this deterministic and matches the prod-fix SQL's own
  // `ORDER BY brand_id, completed_at DESC, id DESC` exactly, rather than
  // leaving a tie to Postgres's unspecified row order for the initial
  // SELECT plus JS's stable sort.
  const sorted = [...completeAudits].sort((a, b) => {
    const byCompletedAt = (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0);
    return byCompletedAt !== 0 ? byCompletedAt : b.id > a.id ? 1 : b.id < a.id ? -1 : 0;
  });
  const latestByBrand = new Map<string, string>();
  for (const a of sorted) {
    if (!latestByBrand.has(a.brandId)) latestByBrand.set(a.brandId, a.id);
  }
  return [...latestByBrand.values()];
}
