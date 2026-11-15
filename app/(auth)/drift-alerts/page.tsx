import { and, desc, eq, getTableColumns, gte, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { DriftAlertsView } from "@/components/domain/drift/drift-alerts-view";
import { withRlsContext } from "@/db/client";
import { brands, driftAlerts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { auditChanges } from "@/lib/visibility/audit-change";

export default async function DriftAlertsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const orgId = currentUser.organizationId;

  const [activeCount, weekCount, resolvedCount, activeAlerts] = await withRlsContext(
    orgId,
    async (tx) => {
      return Promise.all([
        tx
          .select({ count: sql<number>`count(*)::int` })
          .from(driftAlerts)
          .innerJoin(brands, and(eq(driftAlerts.brandId, brands.id), isNull(brands.deletedAt)))
          .where(and(eq(driftAlerts.organizationId, orgId), eq(driftAlerts.acknowledged, false))),
        tx
          .select({ count: sql<number>`count(*)::int` })
          .from(driftAlerts)
          .innerJoin(brands, and(eq(driftAlerts.brandId, brands.id), isNull(brands.deletedAt)))
          .where(
            and(
              eq(driftAlerts.organizationId, orgId),
              gte(driftAlerts.createdAt, sql`NOW() - INTERVAL '7 days'`),
            ),
          ),
        tx
          .select({ count: sql<number>`count(*)::int` })
          .from(driftAlerts)
          .innerJoin(brands, and(eq(driftAlerts.brandId, brands.id), isNull(brands.deletedAt)))
          .where(
            and(
              eq(driftAlerts.organizationId, orgId),
              eq(driftAlerts.acknowledged, true),
              gte(driftAlerts.acknowledgedAt, sql`NOW() - INTERVAL '30 days'`),
            ),
          ),
        tx
          .select({ ...getTableColumns(driftAlerts), brandName: brands.name })
          .from(driftAlerts)
          .innerJoin(brands, and(eq(driftAlerts.brandId, brands.id), isNull(brands.deletedAt)))
          .where(and(eq(driftAlerts.organizationId, orgId), eq(driftAlerts.acknowledged, false)))
          .orderBy(desc(driftAlerts.createdAt))
          .limit(50),
      ]);
    },
  );
  // 17 Nov, part 3: each alert's change, from its two audits as their audit pages show them ("Audit #49 → #50: 25%
  // (10 of 40) → 33% (13 of 40), up 8 points") -- not a bare "+8.0" with no audits, nor a green "Rise" for one within
  // noise.
  const changes = await withRlsContext(orgId, (tx) =>
    auditChanges(
      tx,
      activeAlerts.map((a) => ({
        key: a.id,
        beforeId: a.previousAuditId ?? null,
        afterId: a.currentAuditId ?? null,
      })),
    ),
  );

  return (
    <DriftAlertsView
      activeCount={activeCount[0].count}
      weekCount={weekCount[0].count}
      resolvedCount={resolvedCount[0].count}
      alerts={activeAlerts.map((a) => ({
        ...a,
        change: changes.get(a.id) ?? null,
        dimensionDeltas: (a.dimensionDeltas ?? {}) as Record<
          string,
          { delta: number; severity: string }
        >,
      }))}
    />
  );
}
