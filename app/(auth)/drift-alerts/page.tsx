import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { redirect } from "next/navigation";
import { DriftAlertsView } from "@/components/domain/drift/drift-alerts-view";
import { withRlsContext } from "@/db/client";
import { brands, driftAlerts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function DriftAlertsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const orgId = currentUser.organizationId;

  const [activeCount, weekCount, resolvedCount, activeAlerts] =
    await withRlsContext(orgId, async (tx) => {
      return Promise.all([
        tx
          .select({ count: sql<number>`count(*)::int` })
          .from(driftAlerts)
          .where(
            and(
              eq(driftAlerts.organizationId, orgId),
              eq(driftAlerts.acknowledged, false),
            ),
          ),
        tx
          .select({ count: sql<number>`count(*)::int` })
          .from(driftAlerts)
          .where(
            and(
              eq(driftAlerts.organizationId, orgId),
              gte(driftAlerts.createdAt, sql`NOW() - INTERVAL '7 days'`),
            ),
          ),
        tx
          .select({ count: sql<number>`count(*)::int` })
          .from(driftAlerts)
          .where(
            and(
              eq(driftAlerts.organizationId, orgId),
              eq(driftAlerts.acknowledged, true),
              gte(
                driftAlerts.acknowledgedAt,
                sql`NOW() - INTERVAL '30 days'`,
              ),
            ),
          ),
        tx
          .select({ ...getTableColumns(driftAlerts), brandName: brands.name })
          .from(driftAlerts)
          .innerJoin(brands, eq(driftAlerts.brandId, brands.id))
          .where(
            and(
              eq(driftAlerts.organizationId, orgId),
              eq(driftAlerts.acknowledged, false),
            ),
          )
          .orderBy(desc(driftAlerts.createdAt))
          .limit(50),
      ]);
    });

  return (
    <DriftAlertsView
      activeCount={activeCount[0].count}
      weekCount={weekCount[0].count}
      resolvedCount={resolvedCount[0].count}
      alerts={activeAlerts.map((a) => ({
        ...a,
        dimensionDeltas: (a.dimensionDeltas ?? {}) as Record<string, { delta: number; severity: string }>,
      }))}
    />
  );
}
