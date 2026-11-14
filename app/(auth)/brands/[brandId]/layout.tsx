import { and, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbBrand } from "@/components/domain/set-breadcrumb-brand";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { isUuid } from "@/lib/validation/uuid";

export default async function BrandLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError) notFound();
    throw e;
  }

  // 14 Nov, part 6: every page under the brand names it in the breadcrumb ("Hero Home Services", not
  // "Brand"). A brand that isn't there is left to the page, which says so.
  const [brand] = await withRlsContext(currentUser.organizationId, (tx) =>
    tx
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      ),
  );

  return (
    <>
      {brand ? <SetBreadcrumbBrand brand={brand} /> : null}
      {children}
    </>
  );
}
