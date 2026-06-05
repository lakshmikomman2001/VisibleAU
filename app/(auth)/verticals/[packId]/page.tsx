import { formatDistanceToNow } from "date-fns";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { brands, verticalPackPrompts, verticalPacks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function PackDetailPage({ params }: { params: Promise<{ packId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { packId } = await params;
  const pack = await db.query.verticalPacks.findFirst({
    where: eq(verticalPacks.id, packId),
  });
  if (!pack || pack.retiredAt) notFound();

  const categoryBreakdown = await db
    .select({
      category: verticalPackPrompts.category,
      count: sql<number>`count(*)::int`,
    })
    .from(verticalPackPrompts)
    .where(and(eq(verticalPackPrompts.packId, pack.id), isNotNull(verticalPackPrompts.category)))
    .groupBy(verticalPackPrompts.category)
    .orderBy(desc(sql`count(*)`));

  const [{ count: brandsCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(brands)
    .where(and(eq(brands.vertical, pack.vertical), isNull(brands.deletedAt)));

  const updatedLabel = pack.updatedAt
    ? formatDistanceToNow(new Date(pack.updatedAt), { addSuffix: true })
    : "—";

  function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 8px",
            borderRadius: 9999,
            fontSize: 11,
            fontWeight: 500,
            background: "var(--accent-blue-soft)",
            color: "var(--accent-blue)",
            marginBottom: 12,
          }}
        >
          {pack.version}
        </span>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            margin: "0 0 4px",
          }}
        >
          {pack.name}
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
          Last updated {updatedLabel}
        </p>
      </div>

      {/* KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 32,
        }}
      >
        {[
          { label: "Prompts", value: String(pack.promptsCount) },
          { label: "Categories", value: String(categoryBreakdown.length) },
          { label: "Active brands", value: String(brandsCount) },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{
              padding: 16,
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 6 }}>
              {kpi.label}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                color: "var(--text-primary)",
              }}
            >
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Category breakdown */}
      <div
        style={{
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Categories
          </h3>
        </div>
        {categoryBreakdown.map((cat) => (
          <div
            key={cat.category}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 20px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
              {capitalize(cat.category ?? "")}
            </span>
            <span
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                color: "var(--text-tertiary)",
              }}
            >
              {cat.count}
            </span>
          </div>
        ))}
      </div>

      {/* Read-only notice */}
      <div
        style={{
          marginTop: 24,
          padding: "12px 16px",
          borderRadius: 8,
          background: "var(--info-soft)",
          border: "1px solid var(--border-default)",
          fontSize: 13,
          color: "var(--text-secondary)",
        }}
      >
        Prompt editing ships in v1.1. Vertical packs are currently curated by the VisibleAU team.
      </div>
    </div>
  );
}
