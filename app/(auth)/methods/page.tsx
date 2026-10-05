import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { VerifiedSource } from "@/components/domain/brand-entity/verified-source";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, withRlsContext } from "@/db/client";
import { citabilityMethods } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { getCurrentUser } from "@/lib/auth/current-user";

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
    .orderBy(desc(citabilityMethods.effectSizePct))
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
        {/* Task VVV: effect sizes are Vunnara's own estimates, not research
            findings -- only methods with a real, verified source (via the
            shared lib/methodology/verified-citations.ts) are presented as
            research below. */}
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>
          Effect sizes are Vunnara&apos;s own estimates based on AEO best practice; where
          independent research supports a method, it&apos;s linked.
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
          <div style={{ textAlign: "right" }}>Effect size</div>
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
            <div
              style={{
                textAlign: "right",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                color: "var(--success)",
              }}
            >
              +{Number(m.effectSizePct ?? 0).toFixed(0)}%
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
          Showing top 10 of {total} methods. Upgrade to Starter to see all with full effect-size
          data.
        </div>
      )}
    </div>
  );
}
