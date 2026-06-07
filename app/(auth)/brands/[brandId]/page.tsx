import { and, count, desc, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, setRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const [brand] = await db
    .select()
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

  const [{ auditCount }] = await db
    .select({ auditCount: count() })
    .from(audits)
    .where(eq(audits.brandId, brand.id));

  const recentAudits = await db
    .select({ scoreComposite: audits.scoreComposite, completedAt: audits.completedAt })
    .from(audits)
    .where(and(eq(audits.brandId, brand.id), eq(audits.status, "complete")))
    .orderBy(desc(audits.completedAt))
    .limit(12);

  const latestAudit = recentAudits[0] ?? null;

  return (
    <>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name]} />
      <BrandDetailClient
        brand={JSON.parse(JSON.stringify(brand))}
        auditCount={Number(auditCount)}
        recentAudits={JSON.parse(JSON.stringify(recentAudits.reverse()))}
        latestAudit={latestAudit ? JSON.parse(JSON.stringify(latestAudit)) : null}
      />
    </>
  );
}
