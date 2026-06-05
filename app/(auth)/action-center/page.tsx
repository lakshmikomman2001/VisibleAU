import { and, eq, inArray, sql } from "drizzle-orm";
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

  const [totalResult, brandResult, items] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(actionItems)
      .where(
        and(
          eq(actionItems.organizationId, orgId),
          inArray(actionItems.status, ["open", "in_progress"]),
        ),
      ),
    db
      .selectDistinct({ brandId: actionItems.brandId })
      .from(actionItems)
      .where(
        and(
          eq(actionItems.organizationId, orgId),
          inArray(actionItems.status, ["open", "in_progress"]),
        ),
      ),
    db
      .select()
      .from(actionItems)
      .where(
        and(
          eq(actionItems.organizationId, orgId),
          inArray(actionItems.status, ["open", "in_progress"]),
        ),
      ),
  ]);

  const totalCount = totalResult[0].count;
  const brandCount = brandResult.length;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            margin: "0 0 4px",
          }}
        >
          Action Center
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
          {totalCount} open recommendation{totalCount !== 1 ? "s" : ""} across {brandCount} brand
          {brandCount !== 1 ? "s" : ""}
        </p>
      </div>

      {totalCount === 0 ? (
        <div
          style={{
            padding: 32,
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            textAlign: "center",
          }}
        >
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
