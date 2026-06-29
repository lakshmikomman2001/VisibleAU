import { addMonths, startOfMonth } from "date-fns";
import { and, asc, count, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { BrandFilter } from "@/components/domain/action-center/brand-filter";
import { DimensionGroup } from "@/components/domain/action-center/dimension-group";
import { db, setRlsContext } from "@/db/client";
import { actionItems, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function ActionCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { brand: selectedBrandId } = await searchParams;
  const isFree = currentUser.organization.tier === "free";
  const orgId = currentUser.organizationId;
  const monthStart = startOfMonth(new Date());
  const monthEnd = addMonths(monthStart, 1);

  // Fetch org brands for the selector.
  // When brand_access ships (Sprint 8 S8b-01), filter through assertBrandAccess.
  const orgBrands = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(and(eq(brands.organizationId, orgId), isNull(brands.deletedAt)))
    .orderBy(asc(brands.name));

  const brandFilter = selectedBrandId
    ? eq(actionItems.brandId, selectedBrandId)
    : undefined;

  const openWhere = and(
    eq(actionItems.organizationId, orgId),
    inArray(actionItems.status, ["open", "in_progress"]),
    brandFilter,
  );
  const doneWhere = and(
    eq(actionItems.organizationId, orgId),
    eq(actionItems.status, "done"),
    gte(actionItems.doneAt, monthStart),
    lt(actionItems.doneAt, monthEnd),
    brandFilter,
  );

  const [brandResult, items, impactCounts, doneResult] = await Promise.all([
    db
      .selectDistinct({ brandId: actionItems.brandId })
      .from(actionItems)
      .where(openWhere),
    db
      .select({
        id: actionItems.id,
        dimension: actionItems.dimension,
        title: actionItems.title,
        action: actionItems.action,
        confidenceLabel: actionItems.confidenceLabel,
        expectedImpactScore: actionItems.expectedImpactScore,
        evidenceRefs: actionItems.evidenceRefs,
        brandId: actionItems.brandId,
        brandName: brands.name,
      })
      .from(actionItems)
      .innerJoin(brands, eq(actionItems.brandId, brands.id))
      .where(openWhere),
    db
      .select({ expectedImpactScore: actionItems.expectedImpactScore, count: count() })
      .from(actionItems)
      .where(openWhere)
      .groupBy(actionItems.expectedImpactScore),
    db
      .select({ count: count() })
      .from(actionItems)
      .where(doneWhere),
  ]);

  const highCount = Number(impactCounts.find((r) => r.expectedImpactScore === "high")?.count ?? 0);
  const mediumCount = Number(impactCounts.find((r) => r.expectedImpactScore === "medium")?.count ?? 0);
  const lowCount = Number(impactCounts.find((r) => r.expectedImpactScore === "low")?.count ?? 0);
  const totalOpen = highCount + mediumCount + lowCount;
  const brandCount = brandResult.length;
  const doneThisMonth = Number(doneResult[0].count);
  const selectedBrandName = selectedBrandId
    ? orgBrands.find((b) => b.id === selectedBrandId)?.name ?? null
    : null;
  const showBrandLabel = !selectedBrandId;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: "0 0 4px" }}>
            Action Center
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            {totalOpen} open recommendation{totalOpen !== 1 ? "s" : ""}
            {selectedBrandName
              ? ` for ${selectedBrandName}`
              : ` across ${brandCount} brand${brandCount !== 1 ? "s" : ""}`}
          </p>
        </div>
        <BrandFilter
          brands={orgBrands}
          selectedBrandId={selectedBrandId ?? null}
        />
      </div>

      {/* KPI summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 20, borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: 4 }}>
            Open actions
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)", marginBottom: 2 }}>
            {totalOpen}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {highCount} high &middot; {mediumCount} medium &middot; {lowCount} low
          </div>
        </div>
        <div style={{ padding: 20, borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: 4 }}>
            Est. impact if all done
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, color: "var(--success)", fontFamily: "var(--font-mono)", marginBottom: 2 }}>
            High
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>To composite visibility score</div>
        </div>
        <div style={{ padding: 20, borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: 4 }}>
            Done this month
          </div>
          <div style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)", marginBottom: 2 }}>
            {doneThisMonth}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Completed actions</div>
        </div>
      </div>

      {/* Action groups */}
      {totalOpen === 0 ? (
        <div style={{ padding: 32, borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-default)", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
            {selectedBrandName
              ? `No open recommendations for ${selectedBrandName}.`
              : "No recommendations yet. Run an audit to generate action items."}
          </p>
        </div>
      ) : (
        <DimensionGroup items={items} isFree={isFree} showBrandLabel={showBrandLabel} />
      )}
    </div>
  );
}
