import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, setRlsContext } from "@/db/client";
import { brandEntityScores, brands, technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";
import { rollupTo5Categories } from "@/lib/technical-audit/score-aggregator";

const DIM_META = [
  { key: "scoreRobots", label: "Robots.txt", max: 18, desc: "AI crawler access configuration" },
  { key: "scoreLlmsTxt", label: "llms.txt", max: 18, desc: "Structured AI content file" },
  { key: "scoreSchema", label: "Schema markup", max: 16, desc: "JSON-LD richness and completeness" },
  { key: "scoreMeta", label: "Meta tags", max: 14, desc: "Title, description, OG, canonical" },
  { key: "scoreContent", label: "Content quality", max: 12, desc: "SSR + answer capsule pattern" },
  { key: "scoreBrandEntity", label: "Brand & Entity", max: 10, desc: "ABN, Wikipedia AU, directories" },
  { key: "scoreSignals", label: "Signals", max: 6, desc: "Negative signals + prompt injection" },
  { key: "scoreAiDiscovery", label: "AI Discovery", max: 6, desc: "AI endpoints presence" },
];

const CAT_META = [
  { key: "technicalPct", label: "Technical", desc: "Robots + llms.txt + AI Discovery + Signals" },
  { key: "contentPct", label: "Content", desc: "Content quality + Meta tags" },
  { key: "authorityPct", label: "Authority", desc: "Brand & Entity AU presence" },
  { key: "schemaPct", label: "Schema", desc: "JSON-LD markup richness" },
  { key: "performance", label: "Performance", desc: "Coming v1.1" },
];

export default async function TechnicalAuditPage({ params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) notFound();

  const [techAudit] = await db
    .select()
    .from(technicalAudits)
    .where(eq(technicalAudits.brandId, brandId))
    .orderBy(desc(technicalAudits.createdAt))
    .limit(1);

  const [entityScore] = await db
    .select()
    .from(brandEntityScores)
    .where(eq(brandEntityScores.brandId, brandId))
    .orderBy(desc(brandEntityScores.checkedAt))
    .limit(1);

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Technical Audit"]} />
        <div style={{ padding: 48, textAlign: "center", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
          <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>No technical audit yet. Run an audit to see results.</p>
        </div>
      </div>
    );
  }

  const rollup = rollupTo5Categories({
    scoreRobots: Number(techAudit.scoreRobots ?? 0),
    scoreLlmsTxt: Number(techAudit.scoreLlmsTxt ?? 0),
    scoreSchema: Number(techAudit.scoreSchema ?? 0),
    scoreMeta: Number(techAudit.scoreMeta ?? 0),
    scoreContent: Number(techAudit.scoreContent ?? 0),
    scoreBrandEntity: Number(techAudit.scoreBrandEntity ?? 0),
    scoreSignals: Number(techAudit.scoreSignals ?? 0),
    scoreAiDiscovery: Number(techAudit.scoreAiDiscovery ?? 0),
  });

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Technical Audit"]} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: "0 0 4px" }}>
            Technical AI Audit
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            {brand.name} &middot; 8 dimensions &middot; {techAudit.crawledAt ? `Crawled ${new Date(techAudit.crawledAt).toLocaleDateString()}` : ""}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>Technical Score</div>
          <div style={{ fontSize: 48, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {techAudit.scoreComposite ? Number(techAudit.scoreComposite).toFixed(0) : "—"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>of 100</div>
        </div>
      </div>

      {/* 5-Category Rollup */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 32 }}>
        {CAT_META.map((cat) => {
          const val = cat.key === "performance" ? null : (rollup as unknown as Record<string, number | null>)[cat.key];
          return (
            <div key={cat.key} style={{ padding: 16, borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>{cat.label}</div>
              <div style={{ fontSize: 24, fontWeight: 600, fontFamily: "var(--font-mono)", color: val === null ? "var(--text-disabled)" : "var(--text-primary)", marginBottom: 2 }}>
                {val !== null ? `${val}%` : "—"}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{cat.desc}</div>
            </div>
          );
        })}
      </div>

      {/* 8-Dimension Drill-Down */}
      <div style={{ borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border-default)", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>8-Dimension Breakdown</h3>
        </div>
        {DIM_META.map((dim) => {
          const raw = Number((techAudit as Record<string, unknown>)[dim.key] ?? 0);
          const pct = dim.max > 0 ? Math.round((raw / dim.max) * 100) : 0;
          return (
            <div key={dim.key} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{dim.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{dim.desc}</div>
              </div>
              <div style={{ width: 120 }}>
                <div style={{ height: 6, borderRadius: 9999, overflow: "hidden", background: "var(--accent-muted)" }}>
                  <div style={{ height: "100%", borderRadius: 9999, width: `${pct}%`, background: pct >= 60 ? "var(--success)" : pct >= 30 ? "var(--warning)" : "var(--danger)" }} />
                </div>
              </div>
              <div style={{ width: 60, textAlign: "right", fontSize: 13, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                {raw}/{dim.max}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
