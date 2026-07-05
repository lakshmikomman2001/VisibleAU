import { and, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { serviceDb, withRlsContext } from "@/db/client";
import { auditSchedules, brands } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";
import { TIER_AUDIT_LIMITS } from "@/lib/scheduling/tier-limits";
import BrandScheduleView from "./brand-schedule-view";

export default async function BrandSchedulePage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const { brand, schedule } = await withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id, name: brands.name, domain: brands.domain })
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      )
      .limit(1);

    if (!brand) notFound();

    const [schedule] = await tx
      .select()
      .from(auditSchedules)
      .where(
        and(
          eq(auditSchedules.brandId, brand.id),
          eq(auditSchedules.organizationId, currentUser.organizationId),
        ),
      );

    return { brand, schedule };
  });

  const [sub] = await serviceDb
    .select({ tier: subscriptions.tier })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, currentUser.organizationId))
    .limit(1);
  const tier = (sub?.tier ?? "free") as keyof typeof TIER_AUDIT_LIMITS;
  const limits = TIER_AUDIT_LIMITS[tier] ?? {
    frequency: "manual" as const,
    maxScheduled: 0,
  };

  return (
    <BrandScheduleView
      brand={brand}
      schedule={schedule ? JSON.parse(JSON.stringify(schedule)) : null}
      tierFrequency={limits.frequency}
      maxScheduled={limits.maxScheduled}
      tier={tier}
    />
  );
}
