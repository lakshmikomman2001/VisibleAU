import { formatDistanceToNow } from "date-fns";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, setRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { TIER_BRAND_LIMITS } from "@/lib/brands";
import { formatLocation } from "@/lib/verticals/expand-prompt";

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

  await setRlsContext(db, user.organizationId);

  const orgBrands = await db
    .select({
      id: brands.id,
      name: brands.name,
      domain: brands.domain,
      vertical: brands.vertical,
      region: brands.region,
      primaryRegions: brands.primaryRegions,
    })
    .from(brands)
    .where(and(eq(brands.organizationId, user.organizationId), isNull(brands.deletedAt)))
    .orderBy(desc(brands.createdAt));

  const latestAuditRows = await db
    .select({
      brandId: audits.brandId,
      scoreComposite: audits.scoreComposite,
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

  const auditByBrand = new Map(latestAuditRows.map((a) => [a.brandId, a]));

  const brandsWithAudit = orgBrands.map((b) => {
    const latest = auditByBrand.get(b.id);
    const lastScore =
      latest?.status === "complete" && latest.scoreComposite ? latest.scoreComposite : null;
    return {
      ...b,
      lastAuditScore: lastScore,
      lastAuditAt: latest?.createdAt?.toISOString() ?? null,
      lastAuditStatus: latest?.status ?? null,
    };
  });

  const tier = user.organization.tier;
  const limit = TIER_BRAND_LIMITS[tier] ?? 1;
  const tierLabel = capitalize(tier);
  const limitLabel = limit === Infinity ? "unlimited" : String(limit);

  const STATUS_TONE: Record<string, { bg: string; color: string }> = {
    complete: { bg: "var(--success-soft)", color: "var(--success)" },
    running: { bg: "var(--info-soft)", color: "var(--info)" },
    failed: { bg: "var(--danger-soft)", color: "var(--danger)" },
    pending: { bg: "var(--accent-muted)", color: "var(--text-secondary)" },
  };

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
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
          {brandsWithAudit.length} of {limitLabel} brands &middot; {tierLabel} tier
        </p>
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
        <div
          style={{
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            overflow: "hidden",
          }}
        >
          {/* Column headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "4fr 2fr 2fr 2fr 2fr",
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
            <div style={{ textAlign: "right" }}>Last score</div>
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
            const tone = STATUS_TONE[brand.lastAuditStatus ?? ""] ?? STATUS_TONE.pending;

            return (
              <Link
                key={brand.id}
                href={`/brands/${brand.id}`}
                className="hover:bg-[var(--bg-hover)]"
                style={{
                  display: "grid",
                  gridTemplateColumns: "4fr 2fr 2fr 2fr 2fr",
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

                {/* Last score */}
                <div
                  style={{
                    textAlign: "right",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {brand.lastAuditScore ? Number.parseFloat(brand.lastAuditScore).toFixed(1) : "—"}
                </div>

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
                      background: brand.lastAuditAt ? tone.bg : "var(--accent-muted)",
                      color: brand.lastAuditAt ? tone.color : "var(--text-tertiary)",
                    }}
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
