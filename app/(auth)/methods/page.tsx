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

      {/* Vunnara (19 Oct, post-aa83b3a), "the headline is the mention
          rate": this nav item is the app's own "Methodology" page
          (components/domain/app-sidebar.tsx labels /methods this way) --
          mirrors the public /methodology page's equivalent section. */}
      <div
        style={{
          marginBottom: 32,
          padding: "16px 20px",
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 8px",
          }}
        >
          What the Visibility Score measures
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 8px" }}>
          The Visibility Score is how often AI answers mention your business when customers ask
          everyday questions about businesses like yours -- never a question that names your
          business directly. A question that does name it is shown separately, on its own, and is
          never counted toward this score.
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 8px" }}>
          Position (where in the answer you're mentioned) and Source citation (how often a mention
          links to a source) describe how you appear in the answers that DO mention you -- they're
          shown next to the score, but they never change the score itself. Sentiment and Context
          are planned but not yet scored -- no real tone/framing classifier exists yet, so both
          are marked "Not yet measured" rather than shown as a number.
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          From 19 Oct 2026, the Visibility Score is the mention rate. Earlier audits are
          recalculated the same way, every time they're viewed -- there's no separate, older
          scoring method still applying to older audits.
        </p>
      </div>

      {/* Vunnara Build 1, Part H: how an audit's answers are actually
          gathered -- mirrors the public /methodology page's equivalent
          section, in this page's own inline-style convention. */}
      <div
        style={{
          marginBottom: 32,
          padding: "16px 20px",
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 8px",
          }}
        >
          How we gather answers
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 8px" }}>
          Each brand gets a fixed set of questions, generated once from its confirmed categories
          plus a few that name the brand directly. The same questions are reused on every later
          audit unless the brand's categories, competitors, or location change -- so a trend line
          compares like with like, not a freshly-randomised set each time.
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 8px" }}>
          Most engines search the live web for each answer by default. Each question is asked
          once per engine per audit -- "12 questions × 4 engines = 48 answers" means 48 real
          conversations, not 48 attempts at fewer questions.
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 8px" }}>
          An identical question, to the same engine, under the same web-search setting, asked
          again shortly after may reuse that recent answer instead of placing a fresh call -- a
          web-searched answer is kept for a shorter time than a memory-only one, since it can go
          stale faster.
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          A brand's suburb or city is only passed to an engine once confirmed -- and not every
          engine supports it: Gemini's search tool has no location-targeting option at all.
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
