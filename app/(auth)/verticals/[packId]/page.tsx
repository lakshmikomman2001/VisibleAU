import { formatDistanceToNow } from "date-fns";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { CheckCircle2, Lightbulb } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, withRlsContext } from "@/db/client";
import { brands, verticalPackPrompts, verticalPacks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { PRODUCT_NAME } from "@/lib/brand";
import { verticalFacts, verticalTypes } from "@/lib/marketing/vertical-facts";
import { CRUMB } from "@/lib/navigation/breadcrumbs";
import { CATEGORY_LABELS } from "@/lib/prompts/templates";

// 16 Nov, part 7: each category's sample is the pack's own first prompt in it (it was a plumber question for every
// pack: "Who are the best plumbers in {location}?" on Allied Health's and SaaS's), and "what this vertical gets" is
// computed from the product (lib/marketing/vertical-facts.ts) -- it claimed licence and AHPRA verification, an ASIC
// NAP check, HealthEngine and HotDoc presence, Xero/MYOB, STP, G2 and Capterra checks, none of which exist.

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

export default async function PackDetailPage({ params }: { params: Promise<{ packId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { packId } = await params;
  const pack = await db.query.verticalPacks.findFirst({
    where: eq(verticalPacks.id, packId),
  });
  if (!pack || pack.retiredAt) notFound();

  // The pack's own first prompt in each category, by rank: the category's sample.
  const firstPrompts = await db
    .selectDistinctOn([verticalPackPrompts.category], {
      category: verticalPackPrompts.category,
      promptTemplate: verticalPackPrompts.promptTemplate,
    })
    .from(verticalPackPrompts)
    .where(and(eq(verticalPackPrompts.packId, pack.id), isNotNull(verticalPackPrompts.category)))
    .orderBy(verticalPackPrompts.category, asc(verticalPackPrompts.rank));
  const sampleByCategory = new Map(firstPrompts.map((r) => [r.category, r.promptTemplate]));

  const categoryBreakdown = await db
    .select({
      category: verticalPackPrompts.category,
      count: sql<number>`count(*)::int`,
    })
    .from(verticalPackPrompts)
    .where(and(eq(verticalPackPrompts.packId, pack.id), isNotNull(verticalPackPrompts.category)))
    .groupBy(verticalPackPrompts.category)
    .orderBy(desc(sql`count(*)`));

  const [{ count: brandsCount }] = await withRlsContext(currentUser.organizationId, (tx) =>
    tx
      .select({ count: sql<number>`count(*)::int` })
      .from(brands)
      .where(
        and(
          eq(brands.vertical, pack.vertical),
          isNull(brands.deletedAt),
          or(
            isNull(brands.promptPack),
            inArray(brands.classificationStatus, ["pending", "failed"]),
          ),
        ),
      ),
  );

  const updatedLabel = pack.updatedAt
    ? formatDistanceToNow(new Date(pack.updatedAt), { addSuffix: true })
    : "—";

  const displayName = capitalize(pack.vertical);
  const patterns = verticalFacts(pack.vertical);
  const types = verticalTypes(pack.vertical);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 32px" }}>
      <SetBreadcrumbs crumbs={[CRUMB.workspace, CRUMB.verticals, { label: displayName }]} />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 32,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              margin: "0 0 4px",
            }}
          >
            {displayName} (AU)
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            {pack.promptsCount} prompts &middot; {brandsCount} brand
            {brandsCount !== 1 ? "s" : ""} using pack &middot; last updated {updatedLabel}
          </p>
        </div>
      </div>

      {/* KPI cards: three across from 640px, stacked on a phone */}
      <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12, marginBottom: 32 }}>
        {[
          {
            label: "Prompts",
            value: String(pack.promptsCount),
            desc: `Across ${categoryBreakdown.length} categories`,
          },
          {
            label: "Business types",
            value: String(types.length),
            desc: `${types
              .slice(0, 3)
              .map((t) => CATEGORY_LABELS[t])
              .join(", ")}${types.length > 3 ? "…" : ""}`,
          },
          {
            label: "Categories",
            value: String(categoryBreakdown.length),
            desc: "Service discovery, reviews, pricing...",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            style={{
              padding: 20,
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-tertiary)",
                marginBottom: 4,
              }}
            >
              {kpi.label}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                color: "var(--text-primary)",
                marginBottom: 2,
              }}
            >
              {kpi.value}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{kpi.desc}</div>
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
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Prompt categories
          </h3>
        </div>
        {categoryBreakdown.map((cat) => {
          const sample = sampleByCategory.get(cat.category) ?? null;
          return (
            <div
              key={cat.category}
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: "12px 20px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                  {capitalize(cat.category ?? "")}
                </div>
                {sample && (
                  <div
                    style={{
                      fontSize: 12,
                      fontStyle: "italic",
                      color: "var(--text-tertiary)",
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sample}
                  </div>
                )}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "2px 8px",
                  borderRadius: 9999,
                  background: "var(--accent-muted)",
                  color: "var(--text-tertiary)",
                  flexShrink: 0,
                }}
              >
                {cat.count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Vertical-specific patterns */}
      <div
        style={{
          marginTop: 16,
          padding: 20,
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 12px",
          }}
        >
          Vertical-specific patterns
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {patterns.map((pattern) => (
            <div
              key={pattern}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 13,
                color: "var(--text-secondary)",
              }}
            >
              <CheckCircle2
                style={{
                  width: 16,
                  height: 16,
                  marginTop: 2,
                  flexShrink: 0,
                  color: "var(--success)",
                }}
              />
              <span>{pattern}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Info banner */}
      <div
        style={{
          marginTop: 24,
          padding: 16,
          borderRadius: 8,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          background: "var(--bg-subtle)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <Lightbulb
          style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, color: "var(--warning)" }}
        />
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          Vertical packs are continuously updated based on AU search behaviour. New prompts added
          monthly. Prompt editing ships in v1.1 — packs are currently curated by the {PRODUCT_NAME}{" "}
          team.
        </p>
      </div>
    </div>
  );
}
