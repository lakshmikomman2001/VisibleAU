import { formatDistanceToNow } from "date-fns";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { CheckCircle2, Edit3, Lightbulb } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db } from "@/db/client";
import { brands, verticalPackPrompts, verticalPacks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const CATEGORY_SAMPLES: Record<string, string> = {
  "service-discovery": "Who are the best plumbers in {location}?",
  recommendation: "Can you recommend a good plumber in {location}?",
  comparison: "{brand} vs {competitors} — which is better?",
  "service-specific": "Plumber for hot water system installation in {location}?",
  emergency: "24/7 emergency plumber near {location}?",
  pricing: "How much does emergency plumbing cost in {location}?",
  reviews: "Which plumbing companies in {location} have the best reviews?",
  compliance: "Licensed plumbers in {location} — how do I check?",
  "problem-driven": "I have lower back pain — who should I see in {location}?",
};

const VERTICAL_PATTERNS: Record<string, string[]> = {
  tradies: [
    "AU directories prioritised: hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth",
    "NSW/VIC license verification weighted higher in Accuracy dimension",
    "Suburb-specific prompts auto-generated from primary_regions",
    "After-hours/emergency framing checked separately (high-intent)",
    "NAP (Name/Address/Phone) consistency check vs ASIC business register",
  ],
  allied_health: [
    "AHPRA registration verification weighted in Accuracy dimension",
    "Medicare/bulk-billing availability checked in pricing prompts",
    "NDIS provider status factored into service-discovery prompts",
    "Suburb-specific prompts auto-generated from primary_regions",
    "HealthEngine and HotDoc directory presence checked",
  ],
  saas: [
    "Australian data residency and privacy compliance weighted in Accuracy",
    "Xero/MYOB integration mentioned in comparison prompts",
    "STP Phase 2 compliance checked for payroll/HR verticals",
    "G2 and Capterra AU review presence factored into reviews prompts",
    "Pricing in AUD with GST-inclusive display expected",
  ],
};

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

export default async function PackDetailPage({
  params,
}: { params: Promise<{ packId: string }> }) {
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

  const displayName = capitalize(pack.vertical);
  const patterns = VERTICAL_PATTERNS[pack.vertical] ?? VERTICAL_PATTERNS.tradies;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 32px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Vertical packs", displayName]} />

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
            {pack.promptsCount} prompts &middot; {brandsCount} active brand
            {brandsCount !== 1 ? "s" : ""} &middot; last updated {updatedLabel}
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Prompt authoring — Coming v1.1"
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: "var(--bg-elevated)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            cursor: "not-allowed",
            opacity: 0.5,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <Edit3 style={{ width: 14, height: 14 }} />
          Customise prompts
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: "1px 6px",
              borderRadius: 9999,
              background: "var(--accent-muted)",
              color: "var(--text-tertiary)",
              marginLeft: 4,
            }}
          >
            v1.1
          </span>
        </button>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 }}>
        {[
          {
            label: "Prompts",
            value: String(pack.promptsCount),
            desc: `Across ${categoryBreakdown.length} categories`,
          },
          {
            label: "Sub-verticals",
            value: "8",
            desc: "Plumber, electrician, builder...",
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
          const sample = CATEGORY_SAMPLES[cat.category ?? ""] ?? null;
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
          style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 12px" }}
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
          monthly. Prompt editing ships in v1.1 — packs are currently curated by the VisibleAU team.
        </p>
      </div>
    </div>
  );
}
