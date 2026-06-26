import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db } from "@/db/client";
import { citabilityMethods } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function MethodologyPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const isFree = currentUser.organization.tier === "free";
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
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: "0 0 4px" }}>
          Citability Methods
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
          Research-backed methods to improve AI search visibility. Sources: Princeton GEO (KDD 2024), Ahrefs, SE Ranking, BrightEdge.
          {isFree && ` Showing top 10 of ${total}. Upgrade to see all.`}
        </p>
      </div>

      <div style={{ borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-default)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 140px", padding: "10px 20px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)" }}>
          <div>Method</div>
          <div style={{ textAlign: "right" }}>Effect size</div>
          <div style={{ textAlign: "right" }}>Source</div>
        </div>
        {methods.map((m) => (
          <div key={m.methodKey} style={{ display: "grid", gridTemplateColumns: "1fr 100px 140px", padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 2 }}>{m.title}</div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{m.description}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--success)" }}>
              +{Number(m.effectSizePct ?? 0).toFixed(0)}%
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: "var(--text-tertiary)" }}>{m.source}</div>
          </div>
        ))}
      </div>

      {isFree && (
        <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 8, background: "var(--info-soft)", border: "1px solid var(--border-default)", fontSize: 13, color: "var(--text-secondary)", textAlign: "center" }}>
          Showing top 10 of {total} methods. Upgrade to Starter to see all with full effect-size data.
        </div>
      )}
    </div>
  );
}
