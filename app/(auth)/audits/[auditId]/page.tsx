import { format } from "date-fns";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuditRunningView } from "@/components/domain/audit/audit-running";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { withRlsContext } from "@/db/client";
import { actionItems, audits, brands, citations } from "@/db/schema";
import { dedupeResponses } from "@/lib/audit/dedupe-responses";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { AUD_PER_USD } from "@/lib/constants/currency";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import {
  type DimensionKey,
  type DimensionResult,
  resolveComposite,
  resolveDimension,
} from "@/lib/scoring/dimension-result";
import { wilsonCI, wilsonCIFromScore } from "@/lib/scoring/wilson";
import { isUuid } from "@/lib/validation/uuid";

// citations.engine is a plain DB `text` column (not a typed enum), so
// call sites below index this by a bare `string` -- re-declared here
// with a string index signature over the one shared Engine->label map
// (lib/llm/interface.ts) rather than casting at every call site.
const ENGINE_DISPLAY: Record<string, string> = { ...ENGINE_DISPLAY_NAMES };

export default async function AuditPage({
  params,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ tab?: string; engine?: string; status?: string; page?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { auditId } = await params;
  if (!isUuid(auditId)) notFound();

  // --- Complete audit: tabs ---
  const sp = await searchParamsPromise;
  const activeTab = sp.tab === "responses" ? "responses" : "analysis";

  const result = await withRlsContext(currentUser.organizationId, async (tx) => {
    const [audit] = await tx
      .select()
      .from(audits)
      .where(and(eq(audits.id, auditId), eq(audits.organizationId, currentUser.organizationId)));
    if (!audit) redirect("/audits");

    const [brand] = await tx.select().from(brands).where(eq(brands.id, audit.brandId));
    if (!brand) redirect("/audits");

    // Running/pending/failed → progress view
    if (audit.status === "pending" || audit.status === "running" || audit.status === "failed") {
      // audit.engines defaults to [] (NOT NULL), so `engines?.length ?? 2`
      // never falls back — an empty array's length is 0, not nullish, so it
      // read as "0 engines" for every audit until run-audit's load-audit
      // step populates it. engine_count is a plain nullable integer (set
      // atomically alongside engines in that same step), so `?? 2` behaves
      // correctly against it.
      const ec = audit.engineCount ?? 2;
      const pc = audit.promptsCount ?? 10;
      const rc = audit.runsPerPrompt ?? 5;
      const tc = audit.totalCalls ?? ec * pc * rc;
      const [cs] = await tx
        .select({
          total: count(),
          mentions: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
        })
        .from(citations)
        .where(eq(citations.auditId, auditId));
      const promptSource =
        brand.promptPack && Array.isArray(brand.promptPack) && brand.promptPack.length > 0
          ? ("brand-specific" as const)
          : ("vertical-pack" as const);
      return { type: "running" as const, audit, brand, cs, ec, pc, rc, tc, promptSource };
    }

    const [{ totalCitations }] = await tx
      .select({ totalCitations: count() })
      .from(citations)
      .where(eq(citations.auditId, auditId));
    // Organic-scoped mention rate (task SS) -- must match the organic-only
    // basis the headline Frequency dimension uses, not the raw totalCitations
    // above (kept only for the "Responses (N)" tab label's raw count).
    const [{ organicTotal, mentionedTotal }] = await tx
      .select({
        organicTotal: count(),
        mentionedTotal: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
      })
      .from(citations)
      .where(and(eq(citations.auditId, auditId), ORGANIC_ONLY));

    // Task #46 Phase 1: the TRUE independent-sample counts (organic,
    // run_number = 1 -- distinct (engine, prompt) observations, not the
    // replay-inflated organicTotal/mentionedTotal above; task SSS: runs
    // 2-N replay run 1's exact cached response). This is both (a) the
    // "0 mention rows" gate that decides whether Position/Sentiment/
    // Context/Source-citation are real measurements or
    // "insufficient_data" (lib/scoring/dimension-result.ts), derived at
    // READ time so historical audits render correctly without a
    // backfill, and (b) the honest sample size each dimension's Wilson
    // CI is computed from.
    const [{ distinctSampleCount, distinctMentionedCount, distinctAccWithSourcesCount }] = await tx
      .select({
        distinctSampleCount: count(),
        distinctMentionedCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
        distinctAccWithSourcesCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true AND jsonb_array_length(cited_sources) > 0 THEN 1 ELSE 0 END), 0)`,
      })
      .from(citations)
      .where(and(eq(citations.auditId, auditId), ORGANIC_ONLY, eq(citations.runNumber, 1)));

    let analysisData: {
      sentimentBreakdown: { positive: number; neutral: number; negative: number };
      perEngineData: Array<{ engine: string; mentionRate: number; score: number }>;
      competitorData: Array<{ name: string; mentions: number; isYou: boolean }>;
      topActions: Array<{
        id: string;
        title: string;
        expectedImpactScore: string;
        confidenceLabel: string;
        dimension: string;
      }>;
    } | null = null;

    let responsesData: {
      rows: Array<{
        id: string;
        engine: string;
        prompt: string;
        runNumber: number;
        brandMentioned: boolean;
        position: number | null;
        sentimentLabel: string | null;
        responseSnippet: string | null;
        citedSources: unknown;
        replicaCount: number;
      }>;
      filteredTotal: number;
      distinctResponseCount: number;
      page: number;
      pageSize: number;
    } | null = null;

    if (activeTab === "analysis") {
      const sentRows = await tx
        .select({ sentiment: citations.sentimentLabel, count: count() })
        .from(citations)
        .where(
          and(eq(citations.auditId, auditId), eq(citations.brandMentioned, true), ORGANIC_ONLY),
        )
        .groupBy(citations.sentimentLabel);
      const engRows = await tx
        .select({
          engine: citations.engine,
          total: count(),
          mentionCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
        })
        .from(citations)
        .where(and(eq(citations.auditId, auditId), ORGANIC_ONLY))
        .groupBy(citations.engine);
      const tActions = await tx
        .select({
          id: actionItems.id,
          title: actionItems.title,
          expectedImpactScore: actionItems.expectedImpactScore,
          confidenceLabel: actionItems.confidenceLabel,
          dimension: actionItems.dimension,
        })
        .from(actionItems)
        .where(
          and(
            eq(actionItems.auditId, auditId),
            eq(actionItems.organizationId, currentUser.organizationId),
            eq(actionItems.status, "open"),
          ),
        )
        .orderBy(sql`CASE expected_impact_score WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`)
        .limit(3);
      const totalMentions = engRows.reduce((s, r) => s + Number(r.mentionCount), 0);

      // Task #46 Phase 1: was unconditionally `[{ name: brand.name, ...,
      // isYou: true }]` regardless of brands.competitors -- never showed
      // a real competitor even when the brand had some configured.
      // Real counts: the same organic citation set this page's own
      // mention-rate figures use (replays included, matching
      // perEngineData's convention above), text-matched per competitor
      // name with the exact same detector the brand's own mention count
      // uses (lib/audit/detect-mention.ts), not a separate/looser check.
      let competitorData: Array<{ name: string; mentions: number; isYou: boolean }> = [];
      if (brand.competitors.length > 0) {
        const snippetRows = await tx
          .select({ responseSnippet: citations.responseSnippet })
          .from(citations)
          .where(and(eq(citations.auditId, auditId), ORGANIC_ONLY));
        const snippets = snippetRows
          .map((r) => r.responseSnippet)
          .filter((s): s is string => !!s && s.length > 0);

        const competitorCounts = await Promise.all(
          brand.competitors.map(async (name) => {
            let mentions = 0;
            for (const snippet of snippets) {
              const detected = await detectBrandMention(snippet, { name, domain: "" });
              if (detected.found) mentions++;
            }
            return { name, mentions, isYou: false };
          }),
        );

        competitorData = [
          { name: brand.name, mentions: totalMentions, isYou: true },
          ...competitorCounts,
        ].sort((a, b) => b.mentions - a.mentions);
      }

      analysisData = {
        sentimentBreakdown: {
          positive: Number(sentRows.find((r) => r.sentiment === "positive")?.count ?? 0),
          neutral: Number(sentRows.find((r) => r.sentiment === "neutral")?.count ?? 0),
          negative: Number(sentRows.find((r) => r.sentiment === "negative")?.count ?? 0),
        },
        perEngineData: (audit.engines ?? []).map((engine) => {
          const row = engRows.find((r) => r.engine === engine);
          const organicRuns = Number(row?.total ?? 0);
          const mc = Number(row?.mentionCount ?? 0);
          const mr = organicRuns > 0 ? Math.round((mc / organicRuns) * 100) : 0;
          return { engine, mentionRate: mr, score: mr };
        }),
        competitorData,
        topActions: tActions,
      };
    }

    if (activeTab === "responses") {
      const engineFilter = sp.engine && sp.engine !== "all" ? sp.engine : null;
      const statusFilter =
        sp.status === "mentioned" ? true : sp.status === "not_mentioned" ? false : null;
      const page = Math.max(1, Number(sp.page ?? 1));
      const pageSize = 25;

      const conditions = [
        eq(citations.auditId, auditId),
        ...(engineFilter ? [eq(citations.engine, engineFilter)] : []),
        ...(statusFilter !== null ? [eq(citations.brandMentioned, statusFilter)] : []),
      ];

      const [{ filteredCount }] = await tx
        .select({ filteredCount: count() })
        .from(citations)
        .where(and(...conditions));
      // Task TTT: ordered by (engine, prompt, runNumber) rather than
      // createdAt -- so every (engine, prompt) group's rows land adjacent
      // and in a deterministic order within a page, which the content-
      // based replay dedup below depends on (a group split across a page
      // boundary would make the dedup miss a replay that's a real call on
      // this page and a duplicate of one on another page).
      const rawRows = await tx
        .select({
          id: citations.id,
          engine: citations.engine,
          prompt: citations.prompt,
          runNumber: citations.runNumber,
          brandMentioned: citations.brandMentioned,
          position: citations.position,
          sentimentLabel: citations.sentimentLabel,
          responseSnippet: citations.responseSnippet,
          citedSources: citations.citedSources,
        })
        .from(citations)
        .where(and(...conditions))
        .orderBy(citations.engine, citations.prompt, citations.runNumber)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      // Task TTT: collapse byte-identical cache replays (confirmed task
      // SSS: the LLM cache key has no run index, so runs 2-N replay run
      // 1's exact response) into their one live response, content-based --
      // not a hardcoded "5". A future genuinely-independent run with
      // distinct text keeps its own row.
      const rows = dedupeResponses(rawRows);

      const [{ distinctResponseCount }] = await tx
        .select({
          distinctResponseCount: sql<number>`COUNT(DISTINCT (${citations.engine}, ${citations.prompt}, ${citations.responseSnippet}))`,
        })
        .from(citations)
        .where(eq(citations.auditId, auditId));

      responsesData = {
        rows,
        filteredTotal: Number(filteredCount),
        distinctResponseCount: Number(distinctResponseCount),
        page,
        pageSize,
      };
    }

    return {
      type: "complete" as const,
      audit,
      brand,
      totalCitations,
      organicTotal,
      mentionedTotal,
      distinctSampleCount,
      distinctMentionedCount,
      distinctAccWithSourcesCount,
      analysisData,
      responsesData,
    };
  });

  // Handle running/pending/failed view (returned early from transaction)
  if (result.type === "running") {
    const { audit, brand, cs, ec, pc, rc, tc, promptSource } = result;
    return (
      <AuditRunningView
        auditId={auditId}
        brandId={audit.brandId}
        brandName={brand.name}
        initialStatus={audit.status}
        initialProgress={tc > 0 ? Math.min(100, (cs.total / tc) * 100) : 0}
        initialCost={audit.totalCostUsd ? Number.parseFloat(audit.totalCostUsd) : 0}
        initialMentions={cs.mentions}
        initialCompletedCalls={cs.total}
        totalCalls={tc}
        engineCount={ec}
        promptCount={pc}
        runCount={rc}
        errorMessage={
          audit.status === "failed"
            ? ((audit.metadata as Record<string, string>)?.error ?? "Unknown error")
            : null
        }
        promptSource={promptSource}
      />
    );
  }

  const { audit, brand, totalCitations, organicTotal, mentionedTotal, analysisData, responsesData } =
    result;
  const mentionRate =
    organicTotal > 0 ? Math.round((Number(mentionedTotal) / Number(organicTotal)) * 100) : 0;

  // Postgres SUM() returns bigint, which the driver surfaces as a string
  // (not a number) to avoid precision loss -- distinctSampleCount (plain
  // count()) is already a real number, but the two SUM()-derived counts
  // must be coerced here, once, so `=== 0` below means what it says
  // (a string "0" is never === the number 0, which would have silently
  // made resolveDimension treat every mention-dependent dimension as
  // "scored" with a NaN CI, not insufficient_data).
  const distinctSampleCount = result.distinctSampleCount;
  const distinctMentionedCount = Number(result.distinctMentionedCount);
  const distinctAccWithSourcesCount = Number(result.distinctAccWithSourcesCount);

  const totalLLMCalls =
    (audit.engines?.length ?? 1) * (audit.promptsCount ?? 10) * (audit.runsPerPrompt ?? 5);

  // Task #46 Phase 1: resolve every dimension through the one shared
  // insufficient-data contract (lib/scoring/dimension-result.ts),
  // derived at READ time from distinctMentionedCount so historical
  // audits (scored before this fix existed) render correctly with no
  // backfill. Frequency is the one dimension that's always a real
  // measurement, even at 0 mentions (resolveDimension's alwaysScored).
  const freqDim = resolveDimension(
    Number(audit.scoreFrequency ?? 0),
    wilsonCI(distinctMentionedCount, distinctSampleCount),
    distinctMentionedCount,
    { alwaysScored: true },
  );
  const posDim = resolveDimension(
    Number(audit.scorePosition ?? 0),
    wilsonCIFromScore(Number(audit.scorePosition ?? 0), distinctMentionedCount),
    distinctMentionedCount,
  );
  const sentDim = resolveDimension(
    Number(audit.scoreSentimentNumeric ?? 0),
    wilsonCIFromScore(Number(audit.scoreSentimentNumeric ?? 0), distinctMentionedCount),
    distinctMentionedCount,
  );
  const ctxDim = resolveDimension(
    Number(audit.scoreContextNumeric ?? 0),
    wilsonCIFromScore(Number(audit.scoreContextNumeric ?? 0), distinctMentionedCount),
    distinctMentionedCount,
  );
  const accDim = resolveDimension(
    Number(audit.scoreAccuracy ?? 0),
    wilsonCI(distinctAccWithSourcesCount, distinctMentionedCount),
    distinctMentionedCount,
  );
  const dimensionResults: Record<DimensionKey, DimensionResult> = {
    frequency: freqDim,
    position: posDim,
    sentiment: sentDim,
    context: ctxDim,
    accuracy: accDim,
  };
  const compositeResult = resolveComposite(dimensionResults);
  const scoredDimensionCount = Object.values(dimensionResults).filter(
    (d) => d.status === "scored",
  ).length;

  // Shared value-band colour, used by both the breakdown grid and the
  // Sentiment card below -- so the Sentiment card's headline number can
  // never again be hardcoded green (task #46 Phase 1) regardless of the
  // underlying value, insufficient_data included.
  function dimensionColor(result: DimensionResult): string {
    if (result.status !== "scored") return "var(--text-tertiary)";
    return result.value >= 70
      ? "var(--success)"
      : result.value >= 40
        ? "var(--warning)"
        : "var(--danger)";
  }

  const dimensions = [
    {
      key: "frequency",
      name: "Frequency",
      weight: 25,
      desc: "How often you appear",
      result: freqDim,
    },
    {
      key: "position",
      name: "Position",
      weight: 25,
      desc: "Average rank when mentioned",
      result: posDim,
    },
    {
      key: "sentiment",
      name: "Sentiment",
      weight: 20,
      desc: "Tone of mentions",
      result: sentDim,
    },
    {
      key: "context",
      name: "Context",
      weight: 15,
      desc: "Recommended vs listed",
      result: ctxDim,
    },
    {
      key: "accuracy",
      // Display-only relabel: this dimension measures citation rate (accuracyDimensionScore), not
      // factual correctness. DB column (score_accuracy) and internal key (accuracy) are unchanged
      // — see docs/ops for the Phase 1 writeup.
      name: "Source citation",
      weight: 15,
      desc: "How often mentions cite a source",
      result: accDim,
    },
  ] satisfies Array<{ key: DimensionKey; name: string; weight: number; desc: string; result: DimensionResult }>;

  // --- Build filter URL helper ---
  function tabUrl(t: string, extra: Record<string, string> = {}) {
    const p = new URLSearchParams({ tab: t, ...extra });
    return `?${p.toString()}`;
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Audits", `Audit #${audit.auditNumber}`]} />

      {/* HEADER */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 10px",
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 500,
              background: "var(--success-soft)",
              color: "var(--success)",
            }}
          >
            <span
              style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)" }}
            />
            Complete &middot; {audit.engines?.length ?? 0} engines &middot;{" "}
            {audit.promptsCount ?? 0} prompts
          </span>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              margin: "12px 0 4px",
            }}
          >
            {brand.name}
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            Audit #{audit.auditNumber}
            {audit.completedAt && ` · ${format(new Date(audit.completedAt), "d MMM yyyy")}`}
            {audit.startedAt &&
              audit.completedAt &&
              (() => {
                const secs = Math.round(
                  (new Date(audit.completedAt).getTime() - new Date(audit.startedAt).getTime()) /
                    1000,
                );
                return ` · ${secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`}`;
              })()}
            {audit.totalCostUsd &&
              (() => {
                const usd = Number.parseFloat(audit.totalCostUsd);
                const aud = (usd * AUD_PER_USD).toFixed(2);
                return ` · US$${usd.toFixed(2)} cost (≈ A$${aud})`;
              })()}
            {` · ${totalLLMCalls} LLM calls`}
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 32 }}>
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-tertiary)",
            }}
          >
            Visibility Score
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              marginTop: 4,
            }}
          >
            {compositeResult.value.toFixed(1)}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-mono)",
              marginTop: 2,
            }}
          >
            95% CI: {compositeResult.ci.lower.toFixed(1)} — {compositeResult.ci.upper.toFixed(1)}
          </div>
          {/* Task #46 Phase 1: a zero-mention audit's composite literally
              equals Frequency alone -- say so in plain language instead of
              implying a 5-dimension score was computed. A genuine partial
              blend (reachable if a future dimension can go insufficient_data
              independently of the others, per resolveComposite's general
              contract) says how many dimensions it's actually based on. */}
          {compositeResult.basis === "frequency_only" ? (
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4, maxWidth: 220 }}>
              Not mentioned in any of {distinctSampleCount} answer
              {distinctSampleCount === 1 ? "" : "s"} across {audit.engines?.length ?? 0} engine
              {(audit.engines?.length ?? 0) === 1 ? "" : "s"}
            </div>
          ) : (
            scoredDimensionCount < 5 && (
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>
                Based on {scoredDimensionCount} of 5 dimensions
              </div>
            )
          )}
        </div>
      </div>

      {/* TAB BAR */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--border-subtle)",
          marginBottom: 24,
        }}
      >
        {[
          { key: "analysis", label: "Analysis" },
          { key: "responses", label: `Responses (${totalCitations})` },
        ].map((t) => (
          <Link
            key={t.key}
            href={tabUrl(t.key)}
            scroll={false}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 500,
              color: activeTab === t.key ? "var(--text-primary)" : "var(--text-secondary)",
              borderBottom:
                activeTab === t.key ? "2px solid var(--accent-blue)" : "2px solid transparent",
              textDecoration: "none",
              transition: "color 0.15s ease",
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* ═══ ANALYSIS TAB ═══ */}
      {activeTab === "analysis" && analysisData && (
        <>
          {/* Multidimensional breakdown */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              padding: 24,
              marginBottom: 24,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                margin: "0 0 4px",
              }}
            >
              Multidimensional breakdown
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 24px" }}>
              Each dimension is scored 0–100 with 95% confidence intervals.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
              {dimensions.map((d) => {
                // Task #46 Phase 1: an insufficient_data dimension (0
                // mention rows) renders "N/A -- not mentioned" in a
                // neutral colour, with no bar and no CI -- never the
                // numeric 0 it used to collapse to, which read as a real
                // (and falsely alarming) measurement.
                const insufficient = d.result.status === "insufficient_data";
                const sv = d.result.status === "scored" ? d.result.value : null;
                const ci = d.result.status === "scored" ? d.result.ci : null;
                const color = dimensionColor(d.result);
                return (
                  <div key={d.name}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                      {d.name}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 12 }}>
                      {d.desc}
                    </div>
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 600,
                        letterSpacing: "-0.02em",
                        color,
                        fontFamily: "var(--font-mono)",
                        marginBottom: 12,
                      }}
                      aria-label={insufficient ? "Not mentioned — insufficient data" : undefined}
                    >
                      {insufficient ? "N/A" : sv!.toFixed(1)}
                    </div>
                    {insufficient ? (
                      <p
                        style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "0 0 6px" }}
                      >
                        Not mentioned
                      </p>
                    ) : (
                      <>
                        <div
                          style={{
                            height: 6,
                            borderRadius: 9999,
                            position: "relative",
                            overflow: "visible",
                            background: "var(--border-default)",
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              top: 0,
                              bottom: 0,
                              left: `${ci!.lower}%`,
                              width: `${Math.max(ci!.upper - ci!.lower, 0.5)}%`,
                              borderRadius: 9999,
                              background: `color-mix(in srgb, ${color} 35%, transparent)`,
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              top: "50%",
                              transform: "translateY(-50%)",
                              left: `calc(${Math.min(sv!, 100)}% - 5px)`,
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: color,
                              boxShadow: "0 0 0 2px var(--bg-elevated)",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 9,
                            color: "var(--text-secondary)",
                            fontFamily: "var(--font-mono)",
                            marginTop: 6,
                          }}
                        >
                          <span>{ci!.lower.toFixed(0)}</span>
                          <span>{ci!.upper.toFixed(0)}</span>
                        </div>
                      </>
                    )}
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 8 }}>
                      Weight:{" "}
                      <span style={{ fontFamily: "var(--font-mono)" }}>
                        {insufficient ? "excluded" : `${d.weight}%`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3-col grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 16,
              marginBottom: 24,
            }}
          >
            {/* Per-engine */}
            <div
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: 24,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  margin: "0 0 20px",
                }}
              >
                Per-engine performance
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {analysisData.perEngineData.map((e) => (
                  <div key={e.engine}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}
                        >
                          {ENGINE_DISPLAY[e.engine] ?? e.engine}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                          {e.mentionRate}% mention rate
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {e.score.toFixed(1)}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 9999,
                        overflow: "hidden",
                        background: "var(--accent-muted)",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 9999,
                          width: `${e.score}%`,
                          background: e.score >= 60 ? "var(--success)" : "var(--warning)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Sentiment */}
            <div
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: 24,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  margin: "0 0 20px",
                }}
              >
                Sentiment
              </h3>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 600,
                    // Task #46 Phase 1: was hardcoded "var(--success)" --
                    // always green regardless of value, because the old
                    // truthy check (`scoreSentimentNumeric ? ... : "—"`)
                    // never actually reached the "—" branch for a real,
                    // non-null stored value including "0.00". Same
                    // insufficient-data check and value-band colour as
                    // the breakdown grid above, never hardcoded.
                    color: dimensionColor(sentDim),
                    fontFamily: "var(--font-mono)",
                  }}
                  aria-label={
                    sentDim.status === "insufficient_data" ? "Not mentioned — insufficient data" : undefined
                  }
                >
                  {sentDim.status === "scored" ? sentDim.value.toFixed(1) : "N/A"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                  Sentiment score (0–100)
                </div>
              </div>
              {(() => {
                const tot =
                  analysisData.sentimentBreakdown.positive +
                  analysisData.sentimentBreakdown.neutral +
                  analysisData.sentimentBreakdown.negative;
                return tot === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                    Not mentioned — no sentiment data.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      {
                        label: "Positive",
                        count: analysisData.sentimentBreakdown.positive,
                        color: "var(--success)",
                      },
                      {
                        label: "Neutral",
                        count: analysisData.sentimentBreakdown.neutral,
                        color: "var(--text-tertiary)",
                      },
                      {
                        label: "Negative",
                        count: analysisData.sentimentBreakdown.negative,
                        color: "var(--danger)",
                      },
                    ].map((s) => {
                      const pct = tot > 0 ? Math.round((s.count / tot) * 100) : 0;
                      return (
                        <div
                          key={s.label}
                          style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}
                        >
                          <span style={{ width: 64, color: "var(--text-secondary)" }}>
                            {s.label}
                          </span>
                          <div
                            style={{
                              flex: 1,
                              height: 6,
                              borderRadius: 9999,
                              overflow: "hidden",
                              background: "var(--accent-muted)",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                borderRadius: 9999,
                                width: `${pct}%`,
                                background: s.color,
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--text-tertiary)",
                              fontFamily: "var(--font-mono)",
                              minWidth: 20,
                              textAlign: "right",
                            }}
                          >
                            {s.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            {/* Competitor */}
            <div
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: 24,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  margin: "0 0 20px",
                }}
              >
                Competitor context
              </h3>
              {analysisData.competitorData.length === 0 ? (
                // Task #46 Phase 1: competitorData is only ever empty when
                // brands.competitors itself is empty (the query above skips
                // entirely in that case) -- was previously unreachable
                // because this card was hardcoded to a one-row "#1 you"
                // list regardless of brands.competitors.
                <div>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 8px" }}>
                    No competitors configured yet.
                  </p>
                  <Link
                    href={`/brands/${brand.id}`}
                    style={{ fontSize: 12, color: "var(--accent-blue)", textDecoration: "none" }}
                  >
                    Add competitors in brand settings to compare →
                  </Link>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {analysisData.competitorData.map((c, i) => (
                    <div
                      key={c.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        borderRadius: 6,
                        background: c.isYou ? "var(--accent-blue-soft)" : "transparent",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--text-tertiary)",
                            fontFamily: "var(--font-mono)",
                            width: 16,
                            textAlign: "center",
                          }}
                        >
                          #{i + 1}
                        </span>
                        <span
                          style={{
                            fontSize: 12.5,
                            fontWeight: 500,
                            color: c.isYou ? "var(--accent-blue)" : "var(--text-primary)",
                          }}
                        >
                          {c.name}
                          {c.isYou && (
                            <span
                              style={{ fontSize: 10, marginLeft: 4, color: "var(--accent-blue)" }}
                            >
                              (you)
                            </span>
                          )}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {c.mentions}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Center */}
          {analysisData.topActions.length > 0 && (
            <div
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--accent-blue)",
                borderRadius: 8,
                padding: 24,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 20,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Sparkles style={{ width: 16, height: 16, color: "var(--accent-blue)" }} />
                  <h3
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      margin: 0,
                    }}
                  >
                    Recommended actions
                  </h3>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 9999,
                      fontWeight: 500,
                      background: "var(--accent-blue-soft)",
                      color: "var(--accent-blue)",
                    }}
                  >
                    {analysisData.topActions.length} from this audit
                  </span>
                </div>
                <Link
                  href="/action-center"
                  style={{
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    color: "var(--accent-blue)",
                    textDecoration: "none",
                  }}
                >
                  View all <ArrowRight style={{ width: 12, height: 12 }} />
                </Link>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {analysisData.topActions.map((a) => {
                  const toneMap: Record<string, string> = {
                    high: "var(--danger)",
                    medium: "var(--warning)",
                    low: "var(--info)",
                  };
                  const labelMap: Record<string, string> = {
                    high: "High",
                    medium: "Med",
                    low: "Low",
                  };
                  const tone = toneMap[a.expectedImpactScore] ?? "var(--text-tertiary)";
                  return (
                    <Link
                      key={a.id}
                      href={`/action-center/${a.id}`}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 14,
                        padding: "14px 16px",
                        borderRadius: 6,
                        border: "1px solid var(--border-default)",
                        background: "var(--bg-base)",
                        textDecoration: "none",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 9999,
                          flexShrink: 0,
                          marginTop: 2,
                          background: `color-mix(in srgb, ${tone} 15%, transparent)`,
                          color: tone,
                        }}
                      >
                        {labelMap[a.expectedImpactScore] ?? a.expectedImpactScore}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            marginBottom: 2,
                          }}
                        >
                          {a.title}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {a.dimension} &middot; {a.confidenceLabel}
                        </div>
                      </div>
                      <ChevronRight
                        style={{
                          width: 16,
                          height: 16,
                          flexShrink: 0,
                          marginTop: 2,
                          color: "var(--text-tertiary)",
                        }}
                      />
                    </Link>
                  );
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
            Brand mentioned in{" "}
            <strong style={{ color: "var(--text-primary)" }}>{mentionedTotal}</strong> of{" "}
            {organicTotal} organic responses ({mentionRate}% mention rate) — {totalCitations} total
            stored &middot;{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {responsesData.distinctResponseCount}
            </strong>{" "}
            distinct real responses (the rest are 48h-cache replays)
          </p>

          {/* Filters */}
          <div style={{ display: "flex", gap: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { key: "all", label: "All" },
                ...Object.entries(ENGINE_DISPLAY).map(([k, v]) => ({ key: k, label: v })),
              ].map((f) => (
                <Link
                  key={f.key}
                  href={tabUrl("responses", { engine: f.key, status: sp.status ?? "all" })}
                  scroll={false}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 9999,
                    fontSize: 11,
                    fontWeight: 500,
                    textDecoration: "none",
                    background:
                      (sp.engine ?? "all") === f.key
                        ? "var(--accent-blue-soft)"
                        : "var(--accent-muted)",
                    color:
                      (sp.engine ?? "all") === f.key
                        ? "var(--accent-blue)"
                        : "var(--text-secondary)",
                  }}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { key: "all", label: "All" },
                { key: "mentioned", label: "Mentioned" },
                { key: "not_mentioned", label: "Not mentioned" },
              ].map((f) => (
                <Link
                  key={f.key}
                  href={tabUrl("responses", { engine: sp.engine ?? "all", status: f.key })}
                  scroll={false}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 9999,
                    fontSize: 11,
                    fontWeight: 500,
                    textDecoration: "none",
                    background:
                      (sp.status ?? "all") === f.key
                        ? "var(--accent-blue-soft)"
                        : "var(--accent-muted)",
                    color:
                      (sp.status ?? "all") === f.key
                        ? "var(--accent-blue)"
                        : "var(--text-secondary)",
                  }}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Citation cards */}
          {responsesData.rows.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                color: "var(--text-tertiary)",
                fontSize: 13,
                background: "var(--bg-elevated)",
                borderRadius: 8,
                border: "1px solid var(--border-default)",
              }}
            >
              No responses match these filters.
            </div>
          ) : (
            <div
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {responsesData.rows.map((c, i) => (
                <div
                  key={c.id}
                  style={{
                    padding: "16px 20px",
                    borderBottom:
                      i < responsesData!.rows.length - 1
                        ? "1px solid var(--border-subtle)"
                        : "none",
                  }}
                >
                  {/* Badge row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: 9999,
                        background: c.brandMentioned ? "var(--success-soft)" : "var(--danger-soft)",
                        color: c.brandMentioned ? "var(--success)" : "var(--danger)",
                      }}
                    >
                      {c.brandMentioned
                        ? `Mentioned · Position #${c.position ?? "—"}`
                        : "Not mentioned"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {ENGINE_DISPLAY[c.engine] ?? c.engine}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                      {/* Task TTT: "Run N" only when this response is
                          genuinely singular -- once >1 runs shared this
                          exact text, "Run N" would wrongly imply a
                          separate, independent observation per run. */}
                      {c.replicaCount > 1
                        ? `Live · ${c.replicaCount}× identical (cached)`
                        : `Run ${c.runNumber}`}
                    </span>
                  </div>
                  {/* Prompt */}
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      marginBottom: 8,
                    }}
                  >
                    &ldquo;{c.prompt}&rdquo;
                  </div>
                  {/* Response snippet */}
                  {c.responseSnippet && (
                    <div
                      style={{
                        fontSize: 12,
                        lineHeight: 1.6,
                        color: "var(--text-secondary)",
                        paddingLeft: 12,
                        borderLeft: "2px solid var(--accent-blue)",
                        marginBottom: 8,
                      }}
                    >
                      {c.responseSnippet}
                    </div>
                  )}
                  {/* Cited sources */}
                  {Array.isArray(c.citedSources) &&
                    (c.citedSources as Array<{ domain?: string; url?: string }>).length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {(c.citedSources as Array<{ domain?: string; url?: string }>).map(
                          (src, si) => (
                            <span
                              key={`src-${si}`}
                              style={{
                                fontSize: 11,
                                color: "var(--text-tertiary)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              {src.url ? (
                                <a
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    color: "var(--text-tertiary)",
                                    textDecoration: "none",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 3,
                                  }}
                                >
                                  {src.domain ?? src.url}
                                  <ExternalLink style={{ width: 10, height: 10 }} />
                                </a>
                              ) : (
                                (src.domain ?? "source")
                              )}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {responsesData.filteredTotal > responsesData.pageSize && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                marginTop: 16,
              }}
            >
              {responsesData.page > 1 ? (
                <Link
                  href={tabUrl("responses", {
                    engine: sp.engine ?? "all",
                    status: sp.status ?? "all",
                    page: String(responsesData.page - 1),
                  })}
                  scroll={false}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    textDecoration: "none",
                  }}
                >
                  <ChevronLeft style={{ width: 14, height: 14 }} /> Prev
                </Link>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-disabled)" }}>Prev</span>
              )}
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                Page {responsesData.page} of{" "}
                {Math.ceil(responsesData.filteredTotal / responsesData.pageSize)}
              </span>
              {responsesData.page <
              Math.ceil(responsesData.filteredTotal / responsesData.pageSize) ? (
                <Link
                  href={tabUrl("responses", {
                    engine: sp.engine ?? "all",
                    status: sp.status ?? "all",
                    page: String(responsesData.page + 1),
                  })}
                  scroll={false}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    textDecoration: "none",
                  }}
                >
                  Next <ChevronRight style={{ width: 14, height: 14 }} />
                </Link>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-disabled)" }}>Next</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
