import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { BrandCard } from "@/components/domain/brand/brand-card";
import { db } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { TIER_BRAND_LIMITS } from "@/lib/brands";

export default async function BrandsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const orgBrands = await db
    .select({
      id: brands.id,
      name: brands.name,
      domain: brands.domain,
      vertical: brands.vertical,
      primaryRegions: brands.primaryRegions,
      lastAuditScore: sql<string | null>`(
        SELECT score_composite FROM audits
        WHERE audits.brand_id = ${brands.id} AND audits.status = 'complete'
        ORDER BY audits.completed_at DESC NULLS LAST LIMIT 1
      )`,
      lastAuditAt: sql<string | null>`(
        SELECT completed_at::text FROM audits
        WHERE audits.brand_id = ${brands.id} AND audits.status = 'complete'
        ORDER BY audits.completed_at DESC NULLS LAST LIMIT 1
      )`,
    })
    .from(brands)
    .where(and(eq(brands.organizationId, user.organizationId), isNull(brands.deletedAt)));

  const tier = user.organization.tier;
  const limit = TIER_BRAND_LIMITS[tier] ?? 1;
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1).replace("_", " ");
  const limitLabel = limit === Infinity ? "unlimited" : String(limit);

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Brands
        </h1>
        <p
          style={{ fontSize: 14, marginTop: 4, color: "var(--text-secondary)", margin: "4px 0 0" }}
        >
          {orgBrands.length} of {limitLabel} brands &middot; {tierLabel} tier
        </p>
      </div>

      {orgBrands.length === 0 ? (
        <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
          No brands yet. Create your first brand to get started.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(3, 1fr)",
          }}
        >
          {orgBrands.map((brand) => (
            <BrandCard
              key={brand.id}
              id={brand.id}
              name={brand.name}
              domain={brand.domain}
              vertical={brand.vertical}
              primaryRegions={brand.primaryRegions}
              lastAuditScore={brand.lastAuditScore}
              lastAuditAt={brand.lastAuditAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
