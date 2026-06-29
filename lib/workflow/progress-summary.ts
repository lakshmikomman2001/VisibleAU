import { db } from "@/db/client";
import { brands, remediationTasks } from "@/db/schema";
import { eq, and, gte, inArray, isNotNull, isNull, sql, count } from "drizzle-orm";

export interface ProgressSummary {
  completedThisMonth: number;
  totalTasks: number;
  measuredImpact: number | null;
  gapsClosed: number;
  validationPending: boolean;
}

export async function getProgressSummary(
  brandId: string,
): Promise<ProgressSummary> {
  const monthStart = sql`date_trunc('month', now())`;

  const [completedRow] = await db
    .select({ value: count() })
    .from(remediationTasks)
    .where(
      and(
        eq(remediationTasks.brandId, brandId),
        eq(remediationTasks.status, "complete"),
        gte(remediationTasks.completedAt, monthStart),
      ),
    );

  const [totalRow] = await db
    .select({ value: count() })
    .from(remediationTasks)
    .where(eq(remediationTasks.brandId, brandId));

  const [liftRow] = await db
    .select({
      totalLift: sql<number>`COALESCE(SUM(CAST(${remediationTasks.liftAchieved} AS NUMERIC)), 0)`,
      measuredCount: sql<number>`COUNT(${remediationTasks.scoreAfter})`,
    })
    .from(remediationTasks)
    .where(
      and(
        eq(remediationTasks.brandId, brandId),
        eq(remediationTasks.status, "complete"),
        gte(remediationTasks.completedAt, monthStart),
        isNotNull(remediationTasks.scoreAfter),
      ),
    );

  const [gapsRow] = await db
    .select({ value: count() })
    .from(remediationTasks)
    .where(
      and(
        eq(remediationTasks.brandId, brandId),
        eq(remediationTasks.status, "complete"),
      ),
    );

  const completedThisMonth = completedRow?.value ?? 0;
  const hasValidatedResults = (liftRow?.measuredCount ?? 0) > 0;

  return {
    completedThisMonth,
    totalTasks: totalRow?.value ?? 0,
    measuredImpact: hasValidatedResults ? Number(liftRow!.totalLift) : null,
    gapsClosed: gapsRow?.value ?? 0,
    validationPending: completedThisMonth > 0 && !hasValidatedResults,
  };
}

// Aggregate across all accessible brands in the org.
// When brand_access ships (Sprint 8 S8b-01), filter brandIds through assertBrandAccess.
export async function getOrgProgressSummary(
  orgId: string,
): Promise<ProgressSummary> {
  const accessibleBrands = await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.organizationId, orgId), isNull(brands.deletedAt)));

  const brandIds = accessibleBrands.map((b) => b.id);
  if (brandIds.length === 0) {
    return {
      completedThisMonth: 0,
      totalTasks: 0,
      measuredImpact: null,
      gapsClosed: 0,
      validationPending: false,
    };
  }

  const monthStart = sql`date_trunc('month', now())`;
  const scope = inArray(remediationTasks.brandId, brandIds);

  const [completedRow] = await db
    .select({ value: count() })
    .from(remediationTasks)
    .where(
      and(
        scope,
        eq(remediationTasks.status, "complete"),
        gte(remediationTasks.completedAt, monthStart),
      ),
    );

  const [totalRow] = await db
    .select({ value: count() })
    .from(remediationTasks)
    .where(scope);

  const [liftRow] = await db
    .select({
      totalLift: sql<number>`COALESCE(SUM(CAST(${remediationTasks.liftAchieved} AS NUMERIC)), 0)`,
      measuredCount: sql<number>`COUNT(${remediationTasks.scoreAfter})`,
    })
    .from(remediationTasks)
    .where(
      and(
        scope,
        eq(remediationTasks.status, "complete"),
        gte(remediationTasks.completedAt, monthStart),
        isNotNull(remediationTasks.scoreAfter),
      ),
    );

  const [gapsRow] = await db
    .select({ value: count() })
    .from(remediationTasks)
    .where(
      and(
        scope,
        eq(remediationTasks.status, "complete"),
      ),
    );

  const completedThisMonth = completedRow?.value ?? 0;
  const hasValidatedResults = (liftRow?.measuredCount ?? 0) > 0;

  return {
    completedThisMonth,
    totalTasks: totalRow?.value ?? 0,
    measuredImpact: hasValidatedResults ? Number(liftRow!.totalLift) : null,
    gapsClosed: gapsRow?.value ?? 0,
    validationPending: completedThisMonth > 0 && !hasValidatedResults,
  };
}
