import { addMonths, startOfMonth } from "date-fns";
import { and, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { Settings } from "lucide-react";
import { redirect } from "next/navigation";
import { DimensionGroup } from "@/components/domain/action-center/dimension-group";
import { db, setRlsContext } from "@/db/client";
import { actionItems } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function ActionCenterPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const isFree = currentUser.organization.tier === "free";
  const orgId = currentUser.organizationId;
  const monthStart = startOfMonth(new Date());
  const monthEnd = addMonths(monthStart, 1);

  const [brandResult, items, impactCounts, doneResult] = await Promise.all([
    db
      .selectDistinct({ brandId: actionItems.brandId })
      .from(actionItems)
      .where(
        and(eq(actionItems.organizationId, orgId), inArray(actionItems.status, ["open", "in_progress"])),
      ),
    db
      .select()
      .from(actionItems)
      .where(
        and(eq(actionItems.organizationId, orgId), inArray(actionItems.status, ["open", "in_progress"])),
      ),
    db
      .select({ expectedImpactScore: actionItems.expectedImpactScore, count: count() })
      .from(actionItems)
      .where(
        and(eq(actionItems.organizationId, orgId), inArray(actionItems.status, ["open", "in_progress"])),
      )
      .groupBy(actionItems.expectedImpactScore),
    db
      .select({ count: count() })
      .from(actionItems)
      .where(
        and(
          eq(actionItems.organizationId, orgId),
          eq(actionItems.status, "done"),
          gte(actionItems.doneAt, monthStart),
          lt(actionItems.doneAt, monthEnd),
        ),
      ),
  ]);

  const highCount = Number(impactCounts.find((r) => r.expectedImpactScore === "high")?.count ?? 0);
  const mediumCount = Number(impactCounts.find((r) => r.expectedImpactScore === "medium")?.count ?? 0);
  const lowCount = Number(impactCounts.find((r) => r.expectedImpactScore === "low")?.count ?? 0);
  const totalOpen = highCount + mediumCount + lowCount;
  const brandCount = brandResult.length;
  const doneThisMonth = Number(doneResult[0].count);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: "0 0 4px" }}>
            Action Center
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            {totalOpen} open recommendation{totalOpen !== 1 ? "s" : ""} across {brandCount} brand
            {brandCount !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Settings style={{ width: 14, height: 14 }} />
          Filter settings
        </button>
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
            No recommendations yet. Run an audit to generate action items.
          </p>
        </div>
      ) : (
        <DimensionGroup items={items} isFree={isFree} />
      )}
    </div>
  );
}
