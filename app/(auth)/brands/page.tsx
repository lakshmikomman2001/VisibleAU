import { formatDistanceToNow } from "date-fns";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NewBrandButton } from "@/components/domain/new-brand-button";
import { VisibilityCell } from "@/components/shared/visibility-cell";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { engineCoverageLabel } from "@/lib/audit/engine-failure";
import { getCurrentUser } from "@/lib/auth/current-user";
import { brandUsage } from "@/lib/brands/limits";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";
import { visibilityDisplay } from "@/lib/scoring/visibility-display";
import { formatLocation } from "@/lib/verticals/expand-prompt";
import { LAST_AUDIT_TONE_STYLE, lastAuditTone } from "@/lib/brands/audit-age";

const GRADIENTS = [
  "linear-gradient(135deg, #f97316, #ea580c)",
  "linear-gradient(135deg, #06b6d4, #0891b2)",
  "linear-gradient(135deg, #8b5cf6, #6366f1)",
  "linear-gradient(135deg, #22c55e, #16a34a)",
  "linear-gradient(135deg, #ec4899, #db2777)",
];

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

export default async function BrandsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { orgBrands, auditByBrand } = await withRlsContext(user.organizationId, async (tx) => {
    const orgBrands = await tx
      .select({
        id: brands.id,
        name: brands.name,
        domain: brands.domain,
        vertical: brands.vertical,
        region: brands.region,
        primaryRegions: brands.primaryRegions,
        logoUrl: brands.logoUrl,
      })
      .from(brands)
      .where(and(eq(brands.organizationId, user.organizationId), isNull(brands.deletedAt)))
      .orderBy(desc(brands.createdAt));

    const latestAuditRows = await tx
      .select({
        auditId: audits.id,
        brandId: audits.brandId,
        status: audits.status,
        createdAt: audits.createdAt,
      })
      .from(audits)
      .where(
        and(
          eq(audits.organizationId, user.organizationId),
          sql`${audits.id} IN (
            SELECT DISTINCT ON (brand_id) id FROM audits
            WHERE organization_id = ${user.organizationId}
            ORDER BY brand_id, created_at DESC
          )`,
        ),
      );

    // Visibility comes from each brand's latest COMPLETE audit (a
    // running or failed one after it doesn't blank the column), one
    // batched query, through the same resolver as the audit page.
    const latestCompleteRows = await tx
      .select({
        auditId: audits.id,
        brandId: audits.brandId,
        engines: audits.engines,
        promptsCount: audits.promptsCount,
        metadata: audits.metadata,
      })
      .from(audits)
      .where(
        and(
          eq(audits.organizationId, user.organizationId),
          sql`${audits.id} IN (
            SELECT DISTINCT ON (brand_id) id FROM audits
            WHERE organization_id = ${user.organizationId} AND status = 'complete'
            ORDER BY brand_id, created_at DESC
          )`,
        ),
      );
    const resolvedByAuditId = await resolveOrganicDimensions(
      tx,
      latestCompleteRows.map((a) => a.auditId),
    );
    const visibilityByBrand = new Map(
      latestCompleteRows.map((a) => [a.brandId, resolvedByAuditId.get(a.auditId) ?? null]),
    );
    // URGENT audit #37 (31 Oct), item 2: "3 of 4 engines" under the value
    // when the latest complete audit lost a whole engine.
    const coverageByBrand = new Map(
      latestCompleteRows.map((a) => [a.brandId, engineCoverageLabel(a)]),
    );

    const auditByBrand = new Map(
      latestAuditRows.map((a) => [
        a.brandId,
        {
          ...a,
          latestComplete: visibilityByBrand.get(a.brandId) ?? null,
          coverage: coverageByBrand.get(a.brandId) ?? null,
        },
      ]),
    );

    return { orgBrands, auditByBrand };
  });

  const brandsWithAudit = orgBrands.map((b) => {
    const latest = auditByBrand.get(b.id);
    return {
      ...b,
      // "8%" over "3 of 40" -- the audit page's headline -- or "—" with
      // "No audit yet" / "Not enough answers".
      visibility: {
        ...visibilityDisplay(latest?.latestComplete),
        coverage: latest?.coverage ?? null,
      },
      lastAuditAt: latest?.createdAt?.toISOString() ?? null,
      lastAuditStatus: latest?.status ?? null,
    };
  });

  const tier = await effectiveTier(serviceDb, user.organizationId);
  // The same count and rule as POST /api/brands: the header's "New brand"
  // opens the wizard only while the plan has room.
  const usage = brandUsage(tier, brandsWithAudit.length);
  const tierLabel = capitalize(tier);
  const limitLabel = usage.limit === null ? "unlimited" : String(usage.limit);

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Page header: "New brand" beside the title, or under it, full width, on a phone */}
      <div
        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        style={{ marginBottom: 32 }}
      >
        <div>
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
            style={{
              fontSize: 14,
              marginTop: 4,
              color: "var(--text-secondary)",
              margin: "4px 0 0",
            }}
          >
            {brandsWithAudit.length} of {limitLabel} brands &middot; {tierLabel} tier
          </p>
        </div>
        <NewBrandButton usage={usage} variant="page" />
      </div>

      {brandsWithAudit.length === 0 ? (
        <div
          style={{
            padding: 32,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            textAlign: "center",
          }}
        >
          <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
            No brands yet. Create your first brand to get started.
          </p>
        </div>
      ) : (
        // On a phone the table scrolls sideways inside its card (the rows
        // keep a 640px minimum) instead of clipping its columns.
        <div
          style={{
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            overflowX: "auto",
          }}
        >
          {/* Column headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "4fr 2fr 2fr 2fr 2fr",
              minWidth: 640,
              padding: "10px 20px",
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-tertiary)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <div>Brand</div>
            <div>Vertical</div>
            <div>Region</div>
            <div style={{ textAlign: "right" }}>Visibility</div>
            <div style={{ textAlign: "right" }}>Last audit</div>
          </div>

          {/* Brand rows */}
          {brandsWithAudit.map((brand, i) => {
            const regionLabel = formatLocation(
              (brand.primaryRegions as string[])?.[0],
              brand.region?.toUpperCase() ?? "—",
            );
            const timeLabel = brand.lastAuditAt
              ? formatDistanceToNow(new Date(brand.lastAuditAt), { addSuffix: true })
              : "Never";
            // Live invite test follow-ups (8 Nov), part 4: the badge's colour says how old the audit is.
            const toneName = lastAuditTone(brand.lastAuditAt, brand.lastAuditStatus);
            const tone = LAST_AUDIT_TONE_STYLE[toneName];

            return (
              <Link
                key={brand.id}
                href={`/brands/${brand.id}`}
                className="hover:bg-[var(--bg-hover)]"
                style={{
                  display: "grid",
                  gridTemplateColumns: "4fr 2fr 2fr 2fr 2fr",
                  minWidth: 640,
                  padding: "14px 20px",
                  alignItems: "center",
                  borderBottom:
                    i < brandsWithAudit.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  textDecoration: "none",
                  cursor: "pointer",
                  transition: "background 0.15s ease",
                }}
              >
                {/* Brand name + domain */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  {brand.logoUrl ? (
                    // 2 Nov: the logo uploaded in the new-brand wizard.
                    // biome-ignore lint/performance/noImgElement: an uploaded logo, served by /api/branding/logo
                    <img
                      src={brand.logoUrl}
                      alt=""
                      data-brand-logo
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        flexShrink: 0,
                        objectFit: "contain",
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 6,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#fff",
                        background: GRADIENTS[i % GRADIENTS.length],
                      }}
                    >
                      {brand.name[0].toUpperCase()}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {brand.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {brand.domain}
                    </div>
                  </div>
                </div>

                {/* Vertical badge */}
                <div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 8px",
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 500,
                      background: "var(--accent-muted)",
                      color: "var(--text-secondary)",
                      border: "none",
                    }}
                  >
                    {capitalize(brand.vertical)}
                  </span>
                </div>

                {/* Region */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12.5,
                    color: "var(--text-secondary)",
                  }}
                >
                  <MapPin style={{ width: 12, height: 12 }} />
                  {regionLabel}
                </div>

                {/* Visibility -- the latest complete audit's headline */}
                <VisibilityCell display={brand.visibility} />

                {/* Last audit time + chevron */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "2px 8px",
                      borderRadius: 9999,
                      background: tone.bg,
                      color: tone.color,
                    }}
                    data-audit-tone={toneName}
                  >
                    {timeLabel}
                  </span>
                  <ChevronRight style={{ width: 14, height: 14, color: "var(--text-tertiary)" }} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
