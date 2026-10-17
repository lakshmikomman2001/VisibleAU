import { format } from "date-fns";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuditRunningView } from "@/components/domain/audit/audit-running";
import { ResponseAnswerText } from "@/components/domain/audit/response-answer-text";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { SetCurrentBrand } from "@/components/domain/set-current-brand";
import { withRlsContext } from "@/db/client";
import { actionItems, audits, brands, citations } from "@/db/schema";
import { dedupeResponses } from "@/lib/audit/dedupe-responses";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { AUD_PER_USD } from "@/lib/constants/currency";
import { getCached } from "@/lib/llm/cache";
import { type Engine, ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import {
  displayConfidenceLabel,
  LEGACY_CONFIDENCE_LABEL,
  LEGACY_CONFIDENCE_LONG_TEXT,
} from "@/lib/recommendations/confidence-labels";
import type { DimensionKey, DimensionResult } from "@/lib/scoring/dimension-result";
import { dimensionLabel } from "@/lib/scoring/dimension-labels";
import { resolveAuditDimensionsAndComposite } from "@/lib/scoring/resolve-audit-dimensions";
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
    // Task #46 (fix: stored value contradicting its own CI), Part D:
    // totalCitations counts every row across every run (runs 2-N are
    // byte-identical cache replays of run 1, task SSS) -- "Responses
    // (180)" read as 180 independent answers. realResponseCount is
    // run_number = 1 only, the true count of distinct (engine, prompt)
    // answers; the tab label below shows both so the replay-inflated
    // total is never mistaken for independent samples.
    const [{ realResponseCount }] = await tx
      .select({ realResponseCount: count() })
      .from(citations)
      .where(and(eq(citations.auditId, auditId), eq(citations.runNumber, 1)));
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

    // Task #46 (fix: stored value contradicting its own CI): Frequency/
    // Position/Source-citation's VALUE, CI and scored/insufficient_data
    // STATE all come from this one read-time computation over the real
    // organic (is_branded_prompt IS NOT TRUE), run_number = 1 citations --
    // never from the stored audits.score_* columns, which can go stale
    // the moment a prod-fix changes which rows count as organic (e.g.
    // 0066 retroactively reclassifying brand-named prompts) without the
    // audit being re-run. See lib/scoring/resolve-audit-dimensions.ts's
    // own doc comment for the full root-cause writeup (Bondi Audit #8:
    // stored value 44.4 sitting outside its own freshly-computed
    // CI 0.0-16.1). Sentiment/Context are already NOT_MEASURED_DIMENSION
    // inside this same result (Phase 3, Part C) -- nothing else to derive
    // for them.
    const {
      dimensions: dimensionResults,
      composite: compositeResult,
      sampleCount: distinctSampleCount,
      mentionedCount: distinctMentionedCount,
    } = await resolveAuditDimensionsAndComposite(tx, auditId);

    // Task #46 Phase 2, Part C: live vs cached, across EVERY citation
    // row for this audit (not organic-only, not run_number = 1 only --
    // this is about real network/cache activity and cost, not scoring).
    // `is_cache_hit` (migration 0044) is the reliable signal going
    // forward; `cost_estimate_usd = 0` is OR'd in too so a historical
    // row written before that column existed (defaults to false) still
    // counts as cached via the same inference the header used to rely
    // on exclusively -- nothing regresses for old audits, and nothing
    // new is fabricated for them either.
    const [{ liveCallCount, cachedCallCount }] = await tx
      .select({
        liveCallCount: sql<number>`COALESCE(SUM(CASE WHEN NOT (is_cache_hit OR llm_cost_usd::numeric = 0) THEN 1 ELSE 0 END), 0)`,
        cachedCallCount: sql<number>`COALESCE(SUM(CASE WHEN is_cache_hit OR llm_cost_usd::numeric = 0 THEN 1 ELSE 0 END), 0)`,
      })
      .from(citations)
      .where(eq(citations.auditId, auditId));

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
        confidenceBasis: string | null;
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
        responseText: string | null;
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
          confidenceBasis: actionItems.confidenceBasis,
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
        // Task #46 Phase 2, Part 0: run_number = 1 only -- the other
        // runs are byte-identical cache replays (task SSS), so scanning
        // them too would just repeat the same text-match work for no
        // new information. Bounded cost: one text per real (engine,
        // prompt) pair, matched against every configured competitor
        // once each (responses × competitors), not per page-render
        // query.
        const textRows = await tx
          .select({
            prompt: citations.prompt,
            engine: citations.engine,
            llmModel: citations.llmModel,
            responseSnippet: citations.responseSnippet,
            responseText: citations.responseText,
          })
          .from(citations)
          .where(and(eq(citations.auditId, auditId), ORGANIC_ONLY, eq(citations.runNumber, 1)));

        // Text source, best first (task #46 Phase 3, Part B):
        // 1. citations.response_text -- the full answer, stored
        //    permanently since migration 0045. When present the LLM
        //    cache is never consulted for that row.
        // 2. The LLM response cache (lib/llm/cache.ts), keyed by
        //    sha256(prompt + model), 48h TTL -- only for historical
        //    rows with no response_text, while the cache still holds it.
        // 3. citations.response_snippet -- first 500 chars only, so a
        //    competitor named later in a long answer is invisible. A real
        //    accuracy ceiling for pre-0045 audits, not something to
        //    backfill: competitor counts are computed fresh on every view.
        const texts = await Promise.all(
          textRows.map(async (r) => {
            if (r.responseText) return r.responseText;
            if (r.llmModel) {
              const cached = await getCached(r.prompt, r.llmModel, r.engine as Engine);
              if (cached) return cached.response;
            }
            return r.responseSnippet;
          }),
        );
        const validTexts = texts.filter((s): s is string => !!s && s.length > 0);

        const competitorCounts = await Promise.all(
          brand.competitors.map(async (name) => {
            let mentions = 0;
            for (const text of validTexts) {
              const detected = await detectBrandMention(text, { name, domain: "" });
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
          // Task #46 Phase 3, Part B: full answer (NULL on pre-0045 rows).
          responseText: citations.responseText,
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
      realResponseCount,
      organicTotal,
      mentionedTotal,
      dimensionResults,
      compositeResult,
      distinctSampleCount,
      distinctMentionedCount,
      liveCallCount,
      cachedCallCount,
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

  const {
    audit,
    brand,
    totalCitations,
    realResponseCount,
    organicTotal,
    mentionedTotal,
    analysisData,
    responsesData,
  } = result;
  const mentionRate =
    organicTotal > 0 ? Math.round((Number(mentionedTotal) / Number(organicTotal)) * 100) : 0;

  // Task #46 (fix: stored value contradicting its own CI): value, CI and
  // scored/insufficient_data state for every dimension were already
  // resolved inside the transaction above, all from the same read-time
  // citations computation (lib/scoring/resolve-audit-dimensions.ts) --
  // distinctSampleCount/distinctMentionedCount are exposed alongside it
  // purely for display text below (e.g. the "Not mentioned in any of N
  // answers" subtitle), not recomputed separately.
  const { dimensionResults, compositeResult, distinctSampleCount, distinctMentionedCount } = result;
  const freqDim = dimensionResults.frequency;
  const posDim = dimensionResults.position;
  const sentDim = dimensionResults.sentiment;
  const ctxDim = dimensionResults.context;
  const accDim = dimensionResults.accuracy;
  const liveCallCount = Number(result.liveCallCount);
  const cachedCallCount = Number(result.cachedCallCount);

  // Task #46 Phase 2, Part C: "N LLM calls" conflated the NOMINAL count
  // (engines x prompts x runsPerPrompt -- a pure configuration product,
  // unaffected by how many of those were actually cache replays) with
  // real network/cache activity. "Prompt x engine pairs" is the TRUE
  // distinct-prompt-execution count (engines x prompts, no runs
  // multiplier); each pair's runsPerPrompt calls then split into real
  // (live) vs cached, which is what liveCallCount/cachedCallCount
  // measure directly from the DB rather than assume from config.
  const promptEnginePairs = (audit.engines?.length ?? 1) * (audit.promptsCount ?? 10);

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

  // Task #46 Phase 3, Part C: shared tooltip copy for every not_measured
  // surface on this page (breakdown grid + Sentiment card) -- one string,
  // so the wording can't drift between them.
  const notMeasuredTooltip =
    "Tone and recommendation analysis isn't built yet, so this dimension isn't scored";

  // Task #46 Phase 3, Part C: the per-card "Weight" label below used to
  // show each dimension's NOMINAL weight (e.g. "25%") even when the
  // actual blend renormalises against a smaller scored subset -- already
  // wrong whenever fewer than 5 were scored, and permanently wrong now
  // that Sentiment/Context can never be scored. compositeResult.weightsUsed
  // is the real, already-renormalised weight resolveComposite applied;
  // reading it here instead of a hardcoded number is correct by
  // construction and needs no update if the weights ever change.
  const dimensions = [
    {
      key: "frequency",
      name: "Frequency",
      desc: "How often you appear",
      result: freqDim,
    },
    {
      key: "position",
      name: "Position",
      desc: "Average rank when mentioned",
      result: posDim,
    },
    {
      key: "sentiment",
      name: "Sentiment",
      desc: "Tone of mentions",
      result: sentDim,
    },
    {
      key: "context",
      name: "Context",
      desc: "Recommended vs listed",
      result: ctxDim,
    },
    {
      key: "accuracy",
      // Display-only relabel: this dimension measures citation rate (accuracyDimensionScore), not
      // factual correctness. DB column (score_accuracy) and internal key (accuracy) are unchanged
      // — see docs/ops for the Phase 1 writeup.
      name: "Source citation",
      desc: "How often mentions cite a source",
      result: accDim,
    },
  ] satisfies Array<{ key: DimensionKey; name: string; desc: string; result: DimensionResult }>;

  // --- Build filter URL helper ---
  function tabUrl(t: string, extra: Record<string, string> = {}) {
    const p = new URLSearchParams({ tab: t, ...extra });
    return `?${p.toString()}`;
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Audits", `Audit #${audit.auditNumber}`]} />
      {/* Task #46 Phase 2, Part 0: audit.brandId is already the org-scoped,
          RLS-validated brand this page queried above -- declaring it here
          only ever shows the user their own brand's name in the switcher,
          never leaks another org's brand. */}
      <SetCurrentBrand brandId={audit.brandId} />

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
            {` · ${promptEnginePairs} prompt × engine pairs · ${liveCallCount} live call${liveCallCount === 1 ? "" : "s"} · ${cachedCallCount} cached`}
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
          {/* Task #46 Phase 1 (+ Phase 3): a zero-mention audit's composite
              literally equals Frequency alone -- say so in plain language
              instead of implying a multi-dimension score was computed. Since
              Phase 3 permanently excludes Sentiment and Context (not_measured,
              never scored), the ceiling for a "weighted" composite is 3
              measured dimensions (Frequency, Position, Source citation), not
              5 -- this note is dead under today's wiring (Position/Accuracy
              share Frequency's own zero-mention gate, so scoredDimensionCount
              is always 1 or 3, never 2), but stays correct and ready for a
              future dimension that can go insufficient_data independently. */}
          {compositeResult.basis === "frequency_only" ? (
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4, maxWidth: 220 }}>
              Not mentioned in any of {distinctSampleCount} answer
              {distinctSampleCount === 1 ? "" : "s"} across {audit.engines?.length ?? 0} engine
              {(audit.engines?.length ?? 0) === 1 ? "" : "s"}
            </div>
          ) : (
            scoredDimensionCount < 3 && (
              <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4 }}>
                Based on {scoredDimensionCount} of 3 measured dimensions
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
          {
            key: "responses",
            label:
              totalCitations === realResponseCount
                ? `Responses (${totalCitations})`
                : `Responses (${realResponseCount} real · ${totalCitations} incl. replays)`,
          },
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
              Sentiment and Context have no real classifier behind them yet,
              so they're always "Not yet measured" and excluded from the
              score.
              {compositeResult.basis === "frequency_only" &&
                " Position and Source citation also had no mentions to measure this time, so the score is Frequency alone."}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
              {dimensions.map((d) => {
                // Task #46 Phase 1: an insufficient_data dimension (0
                // mention rows) renders "N/A -- not mentioned" in a
                // neutral colour, with no bar and no CI -- never the
                // numeric 0 it used to collapse to, which read as a real
                // (and falsely alarming) measurement.
                const insufficient = d.result.status === "insufficient_data";
                // Task #46 Phase 3, Part C: a DISTINCT third state --
                // Sentiment/Context have no real classifier behind them at
                // all (not a mention-count gap), so they get their own
                // label/tooltip instead of being folded into "insufficient
                // data". Always true for these two, every audit.
                const notMeasured = d.result.status === "not_measured";
                const sv = d.result.status === "scored" ? d.result.value : null;
                const ci = d.result.status === "scored" ? d.result.ci : null;
                const color = dimensionColor(d.result);
                const weightUsed = compositeResult.weightsUsed[d.key as DimensionKey];
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
                      aria-label={
                        notMeasured
                          ? "Not yet measured"
                          : insufficient
                            ? "Not mentioned — insufficient data"
                            : undefined
                      }
                      title={notMeasured ? notMeasuredTooltip : undefined}
                    >
                      {notMeasured ? "—" : insufficient ? "N/A" : sv!.toFixed(1)}
                    </div>
                    {notMeasured ? (
                      <p
                        style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "0 0 6px" }}
                        title={notMeasuredTooltip}
                      >
                        Not yet measured
                      </p>
                    ) : insufficient ? (
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
                        {notMeasured
                          ? "not measured"
                          : insufficient
                            ? "excluded"
                            : `${((weightUsed ?? 0) * 100).toFixed(1)}%`}
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
                    // Task #46 Phase 3, Part C: sentDim is unconditionally
                    // NOT_MEASURED_DIMENSION (see its construction above),
                    // so dimensionColor always returns the neutral tertiary
                    // colour here -- never hardcoded, same shared helper as
                    // the breakdown grid.
                    color: dimensionColor(sentDim),
                    fontFamily: "var(--font-mono)",
                  }}
                  aria-label="Not yet measured"
                  title={notMeasuredTooltip}
                >
                  —
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>
                  Sentiment score (0–100)
                </div>
              </div>
              {/* Task #46 Phase 3, Part C: this card used to break down
                  citations.sentiment_label into Positive/Neutral/Negative
                  counts -- but that label is `mention.found ? "positive" :
                  "neutral"` (lib/audit/run-audit-inline.ts,
                  inngest/functions/run-audit.ts), the exact same
                  mention-presence fabrication the headline score above no
                  longer shows. Showing real-looking bars right under "not
                  yet measured" would contradict it, so this card states the
                  limitation instead of rendering analysisData.sentimentBreakdown
                  as if it were a real tone analysis. */}
              <p style={{ fontSize: 12, color: "var(--text-tertiary)" }} title={notMeasuredTooltip}>
                Not yet measured — {notMeasuredTooltip.toLowerCase()}.
              </p>
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
                          {dimensionLabel(a.dimension)} &middot;{" "}
                          {displayConfidenceLabel(a.confidenceLabel, a.confidenceBasis) ===
                          LEGACY_CONFIDENCE_LABEL
                            ? LEGACY_CONFIDENCE_LONG_TEXT
                            : a.confidenceLabel}
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
                  {/* Response: full answer (expand/collapse) when stored,
                      else the historical snippet with a "not stored" note. */}
                  <ResponseAnswerText
                    responseText={c.responseText}
                    responseSnippet={c.responseSnippet}
                  />

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
