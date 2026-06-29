import { format } from "date-fns";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuditRunningView } from "@/components/domain/audit/audit-running";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, setRlsContext } from "@/db/client";
import { actionItems, audits, brands, citations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AUD_PER_USD } from "@/lib/constants/currency";
import { isUuid } from "@/lib/validation/uuid";

const ENGINE_DISPLAY: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

export default async function AuditPage({
  params,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ tab?: string; engine?: string; status?: string; page?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { auditId } = await params;
  if (!isUuid(auditId)) notFound();

  const [audit] = await db.select().from(audits).where(and(eq(audits.id, auditId), eq(audits.organizationId, currentUser.organizationId)));
  if (!audit) redirect("/audits");

  const [brand] = await db.select().from(brands).where(eq(brands.id, audit.brandId));
  if (!brand) redirect("/audits");

  // Running/pending/failed → progress view
  if (audit.status === "pending" || audit.status === "running" || audit.status === "failed") {
    const ec = audit.engines?.length ?? 2;
    const pc = audit.promptsCount ?? 10;
    const rc = audit.runsPerPrompt ?? 5;
    const tc = audit.totalCalls ?? ec * pc * rc;
    const [cs] = await db.select({ total: count(), mentions: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)` }).from(citations).where(eq(citations.auditId, auditId));
    const promptSource = brand.promptPack && Array.isArray(brand.promptPack) && brand.promptPack.length > 0 ? "brand-specific" as const : "vertical-pack" as const;
    return <AuditRunningView auditId={auditId} brandId={audit.brandId} brandName={brand.name} initialStatus={audit.status} initialProgress={tc > 0 ? Math.min(100, (cs.total / tc) * 100) : 0} initialCost={audit.totalCostUsd ? Number.parseFloat(audit.totalCostUsd) : 0} initialMentions={cs.mentions} initialCompletedCalls={cs.total} totalCalls={tc} engineCount={ec} promptCount={pc} runCount={rc} errorMessage={audit.status === "failed" ? ((audit.metadata as Record<string, string>)?.error ?? "Unknown error") : null} promptSource={promptSource} />;
  }

  // --- Complete audit: tabs ---
  const sp = await searchParamsPromise;
  const activeTab = sp.tab === "responses" ? "responses" : "analysis";

  const [{ totalCitations }] = await db.select({ totalCitations: count() }).from(citations).where(eq(citations.auditId, auditId));
  const [{ mentionedTotal }] = await db.select({ mentionedTotal: count() }).from(citations).where(and(eq(citations.auditId, auditId), eq(citations.brandMentioned, true)));
  const mentionRate = totalCitations > 0 ? Math.round((Number(mentionedTotal) / Number(totalCitations)) * 100) : 0;

  const totalLLMCalls = (audit.engines?.length ?? 1) * (audit.promptsCount ?? 10) * (audit.runsPerPrompt ?? 5);
  const dimensions = [
    { key: "frequency", name: "Frequency", weight: 25, desc: "How often you appear", score: audit.scoreFrequency },
    { key: "position", name: "Position", weight: 25, desc: "Average rank when mentioned", score: audit.scorePosition },
    { key: "sentiment", name: "Sentiment", weight: 20, desc: "Tone of mentions", score: audit.scoreSentimentNumeric },
    { key: "context", name: "Context", weight: 15, desc: "Recommended vs listed", score: audit.scoreContextNumeric },
    { key: "accuracy", name: "Accuracy", weight: 15, desc: "Factual correctness", score: audit.scoreAccuracy },
  ];
  const ciData = (audit.confidenceIntervals ?? {}) as Record<string, { lower: number; upper: number }>;

  // --- Tab-specific data ---
  let analysisData: { sentimentBreakdown: { positive: number; neutral: number; negative: number }; perEngineData: Array<{ engine: string; mentionRate: number; score: number }>; competitorData: Array<{ name: string; mentions: number; isYou: boolean }>; topActions: Array<{ id: string; title: string; expectedImpactScore: string; confidenceLabel: string; dimension: string }> } | null = null;

  let responsesData: { rows: Array<{ id: string; engine: string; prompt: string; runNumber: number; brandMentioned: boolean; position: number | null; sentimentLabel: string | null; responseSnippet: string | null; citedSources: unknown }>; filteredTotal: number; page: number; pageSize: number } | null = null;

  if (activeTab === "analysis") {
    const sentRows = await db.select({ sentiment: citations.sentimentLabel, count: count() }).from(citations).where(and(eq(citations.auditId, auditId), eq(citations.brandMentioned, true))).groupBy(citations.sentimentLabel);
    const engRows = await db.select({ engine: citations.engine, mentionCount: count() }).from(citations).where(and(eq(citations.auditId, auditId), eq(citations.brandMentioned, true))).groupBy(citations.engine);
    const tActions = await db.select({ id: actionItems.id, title: actionItems.title, expectedImpactScore: actionItems.expectedImpactScore, confidenceLabel: actionItems.confidenceLabel, dimension: actionItems.dimension }).from(actionItems).where(and(eq(actionItems.auditId, auditId), eq(actionItems.organizationId, currentUser.organizationId), eq(actionItems.status, "open"))).orderBy(sql`CASE expected_impact_score WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`).limit(3);
    const totalMentions = engRows.reduce((s, r) => s + Number(r.mentionCount), 0);

    analysisData = {
      sentimentBreakdown: {
        positive: Number(sentRows.find((r) => r.sentiment === "positive")?.count ?? 0),
        neutral: Number(sentRows.find((r) => r.sentiment === "neutral")?.count ?? 0),
        negative: Number(sentRows.find((r) => r.sentiment === "negative")?.count ?? 0),
      },
      perEngineData: (audit.engines ?? []).map((engine) => {
        const row = engRows.find((r) => r.engine === engine);
        const totalRuns = (audit.promptsCount ?? 10) * (audit.runsPerPrompt ?? 5);
        const mc = Number(row?.mentionCount ?? 0);
        const mr = totalRuns > 0 ? Math.round((mc / totalRuns) * 100) : 0;
        return { engine, mentionRate: mr, score: mr };
      }),
      competitorData: [{ name: brand.name, mentions: totalMentions, isYou: true }],
      topActions: tActions,
    };
  }

  if (activeTab === "responses") {
    const engineFilter = sp.engine && sp.engine !== "all" ? sp.engine : null;
    const statusFilter = sp.status === "mentioned" ? true : sp.status === "not_mentioned" ? false : null;
    const page = Math.max(1, Number(sp.page ?? 1));
    const pageSize = 25;

    const conditions = [eq(citations.auditId, auditId), ...(engineFilter ? [eq(citations.engine, engineFilter)] : []), ...(statusFilter !== null ? [eq(citations.brandMentioned, statusFilter)] : [])];

    const [{ filteredCount }] = await db.select({ filteredCount: count() }).from(citations).where(and(...conditions));
    const rows = await db.select({ id: citations.id, engine: citations.engine, prompt: citations.prompt, runNumber: citations.runNumber, brandMentioned: citations.brandMentioned, position: citations.position, sentimentLabel: citations.sentimentLabel, responseSnippet: citations.responseSnippet, citedSources: citations.citedSources }).from(citations).where(and(...conditions)).orderBy(desc(citations.createdAt)).limit(pageSize).offset((page - 1) * pageSize);

    responsesData = { rows, filteredTotal: Number(filteredCount), page, pageSize };
  }

  // --- Build filter URL helper ---
  function tabUrl(t: string, extra: Record<string, string> = {}) {
    const p = new URLSearchParams({ tab: t, ...extra });
    return `?${p.toString()}`;
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Audits", `Audit #${audit.auditNumber}`]} />

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 9999, fontSize: 11, fontWeight: 500, background: "var(--success-soft)", color: "var(--success)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)" }} />
            Complete &middot; {audit.engines?.length ?? 0} engines &middot; {audit.promptsCount ?? 0} prompts
          </span>
          <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: "12px 0 4px" }}>{brand.name}</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            Audit #{audit.auditNumber}
            {audit.completedAt && ` · ${format(new Date(audit.completedAt), "d MMM yyyy")}`}
            {audit.startedAt && audit.completedAt && (() => {
              const secs = Math.round((new Date(audit.completedAt).getTime() - new Date(audit.startedAt).getTime()) / 1000);
              return ` · ${secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`}`;
            })()}
            {audit.totalCostUsd && (() => {
              const usd = Number.parseFloat(audit.totalCostUsd);
              const aud = (usd * AUD_PER_USD).toFixed(2);
              return ` · US$${usd.toFixed(2)} cost (≈ A$${aud})`;
            })()}
            {` · ${totalLLMCalls} LLM calls`}
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 32 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>Visibility Score</div>
          <div style={{ fontSize: 48, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-primary)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {audit.scoreComposite ? Number.parseFloat(audit.scoreComposite).toFixed(1) : "—"}
          </div>
          {audit.scoreConfidenceLow && audit.scoreConfidenceHigh && (
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
              95% CI: {Number.parseFloat(audit.scoreConfidenceLow).toFixed(1)} — {Number.parseFloat(audit.scoreConfidenceHigh).toFixed(1)}
            </div>
          )}
        </div>
      </div>

      {/* TAB BAR */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border-subtle)", marginBottom: 24 }}>
        {[
          { key: "analysis", label: "Analysis" },
          { key: "responses", label: `Responses (${totalCitations})` },
        ].map((t) => (
          <Link key={t.key} href={tabUrl(t.key)} scroll={false} style={{ padding: "10px 20px", fontSize: 13, fontWeight: 500, color: activeTab === t.key ? "var(--text-primary)" : "var(--text-secondary)", borderBottom: activeTab === t.key ? "2px solid var(--accent-blue)" : "2px solid transparent", textDecoration: "none", transition: "color 0.15s ease" }}>
            {t.label}
          </Link>
        ))}
      </div>

      {/* ═══ ANALYSIS TAB ═══ */}
      {activeTab === "analysis" && analysisData && (
        <>
          {/* Multidimensional breakdown */}
          <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, padding: 24, marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>Multidimensional breakdown</h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 24px" }}>Each dimension is scored 0–100 with 95% confidence intervals.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
              {dimensions.map((d) => {
                const ci = ciData[d.key] ?? { lower: 0, upper: 0 };
                const sv = d.score !== null ? Number.parseFloat(String(d.score)) : null;
                const color = sv === null ? "var(--text-tertiary)" : sv >= 70 ? "var(--success)" : sv >= 40 ? "var(--warning)" : "var(--danger)";
                return (
                  <div key={d.name}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{d.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 12 }}>{d.desc}</div>
                    <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color, fontFamily: "var(--font-mono)", marginBottom: 12 }}>{sv !== null ? sv.toFixed(1) : "—"}</div>
                    <div style={{ height: 6, borderRadius: 9999, position: "relative", overflow: "visible", background: "var(--border-default)" }}>
                      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${ci.lower}%`, width: `${Math.max(ci.upper - ci.lower, 0.5)}%`, borderRadius: 9999, background: `color-mix(in srgb, ${color} 35%, transparent)` }} />
                      {sv !== null && <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: `calc(${Math.min(sv, 100)}% - 5px)`, width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: "0 0 0 2px var(--bg-elevated)" }} />}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
                      <span>{ci.lower.toFixed(0)}</span><span>{ci.upper.toFixed(0)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 8 }}>Weight: <span style={{ fontFamily: "var(--font-mono)" }}>{d.weight}%</span></div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3-col grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
            {/* Per-engine */}
            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 20px" }}>Per-engine performance</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {analysisData.perEngineData.map((e) => (
                  <div key={e.engine}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{ENGINE_DISPLAY[e.engine] ?? e.engine}</span>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{e.mentionRate}% mention rate</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{e.score.toFixed(1)}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 9999, overflow: "hidden", background: "var(--accent-muted)" }}>
                      <div style={{ height: "100%", borderRadius: 9999, width: `${e.score}%`, background: e.score >= 60 ? "var(--success)" : "var(--warning)" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Sentiment */}
            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 20px" }}>Sentiment</h3>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 30, fontWeight: 600, color: "var(--success)", fontFamily: "var(--font-mono)" }}>{audit.scoreSentimentNumeric ? Number.parseFloat(audit.scoreSentimentNumeric).toFixed(1) : "—"}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>Sentiment score (0–100)</div>
              </div>
              {(() => { const tot = analysisData.sentimentBreakdown.positive + analysisData.sentimentBreakdown.neutral + analysisData.sentimentBreakdown.negative; return tot === 0 ? (<p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Not mentioned — no sentiment data.</p>) : (<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[{ label: "Positive", count: analysisData.sentimentBreakdown.positive, color: "var(--success)" }, { label: "Neutral", count: analysisData.sentimentBreakdown.neutral, color: "var(--text-tertiary)" }, { label: "Negative", count: analysisData.sentimentBreakdown.negative, color: "var(--danger)" }].map((s) => {
                  const pct = tot > 0 ? Math.round((s.count / tot) * 100) : 0;
                  return (<div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}><span style={{ width: 64, color: "var(--text-secondary)" }}>{s.label}</span><div style={{ flex: 1, height: 6, borderRadius: 9999, overflow: "hidden", background: "var(--accent-muted)" }}><div style={{ height: "100%", borderRadius: 9999, width: `${pct}%`, background: s.color }} /></div><span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", minWidth: 20, textAlign: "right" }}>{s.count}</span></div>);
                })}
              </div>); })()}
            </div>
            {/* Competitor */}
            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 20px" }}>Competitor context</h3>
              {analysisData.competitorData.length === 0 ? <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>No competitor data.</p> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {analysisData.competitorData.map((c, i) => (
                    <div key={c.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 6, background: c.isYou ? "var(--accent-blue-soft)" : "transparent" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", width: 16, textAlign: "center" }}>#{i + 1}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: c.isYou ? "var(--accent-blue)" : "var(--text-primary)" }}>{c.name}{c.isYou && <span style={{ fontSize: 10, marginLeft: 4, color: "var(--accent-blue)" }}>(you)</span>}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{c.mentions}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Center */}
          {analysisData.topActions.length > 0 && (
            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--accent-blue)", borderRadius: 8, padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Sparkles style={{ width: 16, height: 16, color: "var(--accent-blue)" }} />
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Recommended actions</h3>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 9999, fontWeight: 500, background: "var(--accent-blue-soft)", color: "var(--accent-blue)" }}>{analysisData.topActions.length} from this audit</span>
                </div>
                <Link href="/action-center" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, color: "var(--accent-blue)", textDecoration: "none" }}>View all <ArrowRight style={{ width: 12, height: 12 }} /></Link>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {analysisData.topActions.map((a) => {
                  const toneMap: Record<string, string> = { high: "var(--danger)", medium: "var(--warning)", low: "var(--info)" };
                  const labelMap: Record<string, string> = { high: "High", medium: "Med", low: "Low" };
                  const tone = toneMap[a.expectedImpactScore] ?? "var(--text-tertiary)";
                  return (<Link key={a.id} href={`/action-center/${a.id}`} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 16px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--bg-base)", textDecoration: "none" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999, flexShrink: 0, marginTop: 2, background: `color-mix(in srgb, ${tone} 15%, transparent)`, color: tone }}>{labelMap[a.expectedImpactScore] ?? a.expectedImpactScore}</span>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>{a.title}</div><div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{a.dimension} &middot; {a.confidenceLabel}</div></div>
                    <ChevronRight style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2, color: "var(--text-tertiary)" }} />
                  </Link>);
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ RESPONSES TAB ═══ */}
      {activeTab === "responses" && responsesData && (
        <>
          {/* Summary */}
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>
            Brand mentioned in <strong style={{ color: "var(--text-primary)" }}>{mentionedTotal}</strong> of {totalCitations} responses ({mentionRate}% mention rate)
          </p>

          {/* Filters */}
          <div style={{ display: "flex", gap: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[{ key: "all", label: "All" }, ...Object.entries(ENGINE_DISPLAY).map(([k, v]) => ({ key: k, label: v }))].map((f) => (
                <Link key={f.key} href={tabUrl("responses", { engine: f.key, status: sp.status ?? "all" })} scroll={false} style={{ padding: "4px 12px", borderRadius: 9999, fontSize: 11, fontWeight: 500, textDecoration: "none", background: (sp.engine ?? "all") === f.key ? "var(--accent-blue-soft)" : "var(--accent-muted)", color: (sp.engine ?? "all") === f.key ? "var(--accent-blue)" : "var(--text-secondary)" }}>
                  {f.label}
                </Link>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[{ key: "all", label: "All" }, { key: "mentioned", label: "Mentioned" }, { key: "not_mentioned", label: "Not mentioned" }].map((f) => (
                <Link key={f.key} href={tabUrl("responses", { engine: sp.engine ?? "all", status: f.key })} scroll={false} style={{ padding: "4px 12px", borderRadius: 9999, fontSize: 11, fontWeight: 500, textDecoration: "none", background: (sp.status ?? "all") === f.key ? "var(--accent-blue-soft)" : "var(--accent-muted)", color: (sp.status ?? "all") === f.key ? "var(--accent-blue)" : "var(--text-secondary)" }}>
                  {f.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Citation cards */}
          {responsesData.rows.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13, background: "var(--bg-elevated)", borderRadius: 8, border: "1px solid var(--border-default)" }}>No responses match these filters.</div>
          ) : (
            <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
              {responsesData.rows.map((c, i) => (
                <div key={c.id} style={{ padding: "16px 20px", borderBottom: i < responsesData!.rows.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                  {/* Badge row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 9999, background: c.brandMentioned ? "var(--success-soft)" : "var(--danger-soft)", color: c.brandMentioned ? "var(--success)" : "var(--danger)" }}>
                      {c.brandMentioned ? `Mentioned · Position #${c.position ?? "—"}` : "Not mentioned"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{ENGINE_DISPLAY[c.engine] ?? c.engine}</span>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Run {c.runNumber}</span>
                  </div>
                  {/* Prompt */}
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", marginBottom: 8 }}>&ldquo;{c.prompt}&rdquo;</div>
                  {/* Response snippet */}
                  {c.responseSnippet && (
                    <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)", paddingLeft: 12, borderLeft: "2px solid var(--accent-blue)", marginBottom: 8 }}>{c.responseSnippet}</div>
                  )}
                  {/* Cited sources */}
                  {Array.isArray(c.citedSources) && (c.citedSources as Array<{ domain?: string; url?: string }>).length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(c.citedSources as Array<{ domain?: string; url?: string }>).map((src, si) => (
                        <span key={`src-${si}`} style={{ fontSize: 11, color: "var(--text-tertiary)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                          {src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-tertiary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>{src.domain ?? src.url}<ExternalLink style={{ width: 10, height: 10 }} /></a> : (src.domain ?? "source")}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {responsesData.filteredTotal > responsesData.pageSize && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
              {responsesData.page > 1 ? (
                <Link href={tabUrl("responses", { engine: sp.engine ?? "all", status: sp.status ?? "all", page: String(responsesData.page - 1) })} scroll={false} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}><ChevronLeft style={{ width: 14, height: 14 }} /> Prev</Link>
              ) : <span style={{ fontSize: 12, color: "var(--text-disabled)" }}>Prev</span>}
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                Page {responsesData.page} of {Math.ceil(responsesData.filteredTotal / responsesData.pageSize)}
              </span>
              {responsesData.page < Math.ceil(responsesData.filteredTotal / responsesData.pageSize) ? (
                <Link href={tabUrl("responses", { engine: sp.engine ?? "all", status: sp.status ?? "all", page: String(responsesData.page + 1) })} scroll={false} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)", textDecoration: "none" }}>Next <ChevronRight style={{ width: 14, height: 14 }} /></Link>
              ) : <span style={{ fontSize: 12, color: "var(--text-disabled)" }}>Next</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
