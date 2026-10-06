import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { VerifiedSource } from "@/components/domain/brand-entity/verified-source";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, withRlsContext } from "@/db/client";
import { citabilityMethods } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { getCurrentUser } from "@/lib/auth/current-user";

// Post-ZZZ: impact is a qualitative tier (Sri's own judgment), not a
// measured percentage -- see db/migrations/0035_citability_methods_impact_tier.sql
// and docs/ops/post-launch-db-hardening.md section 32. Same tone mapping as
// components/domain/action-center/recommendation-card.tsx's impact badge,
// for visual consistency with the rest of the app.
const IMPACT_TONE: Record<string, string> = {
  high: "var(--danger-soft)",
  medium: "var(--warning-soft)",
  low: "var(--info-soft)",
};
const IMPACT_COLOR: Record<string, string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--info)",
};
const IMPACT_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export default async function MethodologyPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const [sub] = await withRlsContext(currentUser.organizationId, (tx) =>
    tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1),
  );
  const isFree = (sub?.tier ?? "free") === "free";
  const methods = await db
    .select()
    .from(citabilityMethods)
    .orderBy(
      sql`CASE impact_tier WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
      citabilityMethods.title,
    )
    .limit(isFree ? 10 : 200);

  const total = methods.length;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Methodology"]} />

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
          Citability Methods
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 4px" }}>
          Methods to improve AI search visibility.
          {isFree && ` Showing top 10 of ${total}. Upgrade to see all.`}
        </p>
        {/* Post-ZZZ: impact ratings are a qualitative Vunnara judgment, not
            a measured percentage -- only methods with a real, verified
            source (via the shared lib/methodology/verified-citations.ts)
            are presented as research below. */}
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>
          Impact ratings are Vunnara&apos;s qualitative assessment based on AEO best practice;
          where independent research supports a method, it&apos;s linked.
        </p>
      </div>

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
            display: "grid",
            gridTemplateColumns: "1fr 100px 140px",
            padding: "10px 20px",
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-tertiary)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div>Method</div>
          <div style={{ textAlign: "right" }}>Impact</div>
          <div style={{ textAlign: "right" }}>Source</div>
        </div>
        {methods.map((m) => (
          <div
            key={m.methodKey}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 100px 140px",
              padding: "14px 20px",
              borderBottom: "1px solid var(--border-subtle)",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  marginBottom: 2,
                }}
              >
                {m.title}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{m.description}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 9999,
                  background: IMPACT_TONE[m.impactTier ?? ""] ?? "var(--accent-muted)",
                  color: IMPACT_COLOR[m.impactTier ?? ""] ?? "var(--text-tertiary)",
                }}
              >
                {IMPACT_LABEL[m.impactTier ?? ""] ?? "Unrated"}
              </span>
            </div>
            <div style={{ textAlign: "right", fontSize: 11 }}>
              {m.sourceType === "research" && m.citationUrl ? (
                <VerifiedSource source={m.source} url={m.citationUrl} label={`Research: ${m.source}`} />
              ) : (
                <span style={{ color: "var(--text-tertiary)" }}>Vunnara estimate</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {isFree && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            borderRadius: 8,
            background: "var(--info-soft)",
            border: "1px solid var(--border-default)",
            fontSize: 13,
            color: "var(--text-secondary)",
            textAlign: "center",
          }}
        >
          Showing top 10 of {total} methods. Upgrade to Starter to see all with full impact
          ratings.
        </div>
      )}
    </div>
  );
}
