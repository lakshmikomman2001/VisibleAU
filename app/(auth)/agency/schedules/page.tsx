import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, setRlsContext } from "@/db/client";
import { auditSchedules, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { TIER_AUDIT_LIMITS } from "@/lib/scheduling/tier-limits";
import AgencySchedulesView from "./agency-schedules-view";

const AGENCY_TIERS = ["agency", "agency_pro", "enterprise"];

export default async function AgencySchedulesPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  if (!AGENCY_TIERS.includes(currentUser.organization.tier)) {
    return (
      <div className="p-8">
        <div className="rounded-lg border bg-card p-6 max-w-lg mx-auto text-center">
          <h1 className="text-2xl font-semibold mb-2">Scheduled Audits</h1>
          <p className="text-muted-foreground mb-4">
            Upgrade to the Agency tier to manage audit schedules across your portfolio.
          </p>
          <a
            href="/settings/billing"
            className="inline-block px-4 py-2 rounded-md text-sm font-medium"
            style={{ backgroundColor: "#3b82f6", color: "#fff" }}
          >
            Upgrade to Agency
          </a>
        </div>
      </div>
    );
  }

  const orgId = currentUser.organization.id;
  await setRlsContext(db, orgId);

  const schedules = await db
    .select({
      id: auditSchedules.id,
      brandId: auditSchedules.brandId,
      brandName: brands.name,
      domain: brands.domain,
      frequency: auditSchedules.frequency,
      status: auditSchedules.status,
      nextRunAt: auditSchedules.nextRunAt,
      lastRunAt: auditSchedules.lastRunAt,
      pausedReason: auditSchedules.pausedReason,
    })
    .from(auditSchedules)
    .innerJoin(brands, eq(auditSchedules.brandId, brands.id))
    .where(eq(auditSchedules.organizationId, orgId))
    .orderBy(asc(brands.name));

  const tier = currentUser.organization.tier as keyof typeof TIER_AUDIT_LIMITS;
  const maxScheduled = TIER_AUDIT_LIMITS[tier]?.maxScheduled ?? 0;
  const activeCount = schedules.filter((s) => s.status === "active").length;

  return (
    <AgencySchedulesView
      schedules={schedules}
      activeCount={activeCount}
      maxScheduled={maxScheduled}
    />
  );
}
