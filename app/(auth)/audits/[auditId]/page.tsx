import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuditRunningView } from "@/components/domain/audit/audit-running";
import { DirectoriesCitedPanel } from "@/components/domain/audit/directories-cited-panel";
import { ResponseAnswerText } from "@/components/domain/audit/response-answer-text";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { SetCurrentBrand } from "@/components/domain/set-current-brand";
import { withRlsContext } from "@/db/client";
import { actionItems, audits, brands, citations, engineCallFailures } from "@/db/schema";
import { getAnsweredCount, getAuditCost } from "@/lib/audit/answered-count";
import { dedupeResponses } from "@/lib/audit/dedupe-responses";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { EXCLUDE_UNVERIFIED, ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { recomputeCitationPositions } from "@/lib/audit/recompute-citation-positions";
import {
  AUDIT_STALE_PENDING_MS,
  AUDIT_STALE_RUNNING_INACTIVITY_MS,
  failRealAuditIfStale,
} from "@/lib/audit/stale-audit-guard";
import { getTypicalDurationMinutes } from "@/lib/audit/typical-duration";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  COST_INCOMPLETE_LABEL,
  formatAudCents,
  formatAudFromUsd,
  formatUsd,
} from "@/lib/constants/currency";
import { getDirectoryCitationsForAudit } from "@/lib/directories/citation-counts";
import { getOwnerDirectoryStatements } from "@/lib/directories/owner-statements";
import { getCached } from "@/lib/llm/cache";
import { ENGINE_DISPLAY_NAMES, type Engine } from "@/lib/llm/interface";
import { methodologyLabel } from "@/lib/llm/methodology";
import {
  type DisplayBasis,
  displayBasisLabels,
  displayImpact,
  displayPriorityLabel,
  displayRecommendationTitle,
  isLegacyConfidence,
  resolveDisplayBasis,
} from "@/lib/recommendations/confidence-labels";
import { dimensionLabel } from "@/lib/scoring/dimension-labels";
import type { DimensionKey, DimensionResult } from "@/lib/scoring/dimension-result";
import { headlineColorBand } from "@/lib/scoring/headline-color";
import {
  engineAnswerLine,
  failedNotCountedNote,
  positionCard,
  sourceCitationCard,
} from "@/lib/scoring/measured-display";
import {
  type EngineAnswerCounts,
  resolveAuditDimensionsAndHeadline,
} from "@/lib/scoring/resolve-audit-dimensions";
import { isUuid } from "@/lib/validation/uuid";

// citations.engine is a plain DB `text` column (not a typed enum), so
// call sites below index this by a bare `string` -- re-declared here
// with a string index signature over the one shared Engine->label map
// (lib/llm/interface.ts) rather than casting at every call site.
const ENGINE_DISPLAY: Record<string, string> = { ...ENGINE_DISPLAY_NAMES };

// Vunnara (19 Oct, post-aa83b3a; centralised 20 Oct, post-a093ceb, item
// 5): the Visibility headline's own colour bands, shared with every
// other surface that colour-codes the headline (lib/scoring/
// headline-color.ts) -- deliberately NOT the same 70/40 thresholds
// dimensionColor below uses for Position/Sentiment/Context/Source-
// citation. See that file's header for the full reasoning.
function headlineColor(result: DimensionResult): string {
  if (result.status !== "scored") return "var(--text-tertiary)";
  return headlineColorVar(result.value);
}

/** The same bands for any mention rate, e.g. one engine's. */
function headlineColorVar(rate: number): string {
  const band = headlineColorBand(rate);
  return band === "strong"
    ? "var(--success)"
    : band === "developing"
      ? "var(--warning)"
      : "var(--danger)";
}

// Audit reliability, Part A, item 5: replaces the old bare "search
// failed for N of M questions" with the real reason breakdown
// (engine_call_failures.error_class), e.g. "4 failed: 3 search tool
// errors, 1 timeout" -- the task's own example phrasing.
const FAILURE_REASON_LABELS: Record<string, string> = {
  rate_limited: "rate limit",
  overloaded: "overload",
  timeout: "timeout",
  search_tool_error: "search tool error",
  empty_response: "empty response",
  parse_error: "parse error",
  other: "error",
};

function pluralizeReason(label: string, n: number): string {
  if (n === 1) return `1 ${label}`;
  return `${n} ${label}${label.endsWith("s") ? "" : "s"}`;
}

/** rows: this audit's engine_call_failures, already grouped by
 * error_class (optionally pre-filtered to one engine by the caller). */
function formatFailureBreakdown(rows: Array<{ errorClass: string; count: number }>): string | null {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return null;
  // Merge by error class FIRST -- the audit-wide caller passes rows
  // already grouped by (engine, error_class), so the same class can
  // appear once per engine (e.g. chatgpt's 3 "other"s and perplexity's
  // 3 "other"s) and must collapse into one "6 errors", never list the
  // same reason label twice.
  const byClass = new Map<string, number>();
  for (const r of rows) {
    byClass.set(r.errorClass, (byClass.get(r.errorClass) ?? 0) + r.count);
  }
  const reasons = [...byClass.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([errorClass, n]) => pluralizeReason(FAILURE_REASON_LABELS[errorClass] ?? errorClass, n));
  return `${total} failed: ${reasons.join(", ")}`;
}

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

    // Audit reliability, Part C, item 2 / reliability follow-up item
    // 3 -- "do the same for real audits that use their own budget",
    // corrected: a real audit can legitimately run 11+ minutes
    // (production audit #30 took 11m51s), so elapsed-since-start can
    // never be the right signal here -- failRealAuditIfStale instead
    // checks elapsed-since-LAST-ACTIVITY (the most recent citations/
    // engine_call_failures row), never flipping one that's still
    // actually making progress no matter how long it's been running
    // in total. Flipped here, before the progress-view branch below
    // decides what to render, so this very page load already shows
    // the failure instead of a spinner nothing will ever update again.
    if (audit.status === "pending" || audit.status === "running") {
      const wentStale = await failRealAuditIfStale(
        tx,
        auditId,
        AUDIT_STALE_PENDING_MS,
        AUDIT_STALE_RUNNING_INACTIVITY_MS,
      );
      if (wentStale) audit.status = "failed";
    }

    // Running/pending/failed → progress view
    if (audit.status === "pending" || audit.status === "running" || audit.status === "failed") {
      // "The Running audit page shows made-up numbers" (23 Oct), item 2
      // -- these used to fall back to hardcoded guesses (2 engines, 10
      // prompts, 5 runs) whenever the real column was still null, which
      // production showed as a WRONG but plausible-looking number, not
      // an honest "not known yet". audits.engineCount/engines are
      // written early (both runners' load-audit step); promptsCount/
      // runsPerPrompt/totalCalls used to be written only at Inngest
      // completion (fixed this same task, inngest/functions/run-audit.ts's
      // new record-prompt-count step) -- either way, null here now
      // means exactly what it says, and the client (AuditRunningView)
      // renders "preparing…" instead of fabricating a figure.
      const ec = audit.engineCount;
      const pc = audit.promptsCount;
      const rc = audit.runsPerPrompt;
      const tc =
        audit.totalCalls ?? (ec !== null && pc !== null && rc !== null ? ec * pc * rc : null);

      // Answers received so far -- the SAME "citations + engine_call_
      // failures, run_number = 1" rule the polling endpoint
      // (app/api/audits/[auditId]/route.ts) and the sample-audit status
      // route both use (lib/audit/answered-count.ts); previously this
      // read raw citations rows with no run_number filter and no
      // failure rows added, so the page's OWN first paint could disagree
      // with its first poll a few seconds later.
      const { answeredCount } = await getAnsweredCount(tx, auditId);

      // "Before pushing e53edf2" (24 Oct), item 1 -- "Cost so far" is a
      // real-time sum of each call's own already-measured cost, never
      // audits.totalCostUsd (only ever written at completion) and never
      // a projection.
      const auditCost = await getAuditCost(tx, auditId);

      // Items 2-3 -- mentionedCount/sampleCount/medianPosition/rankedCount
      // from the SAME function the finished page's own "Mentioned in k
      // of n answers" and "Typically #N when listed" come from, not a
      // second, separately-maintained query. Previously this page's own
      // mentions query used EXCLUDE_UNVERIFIED (correct) but the polling
      // endpoint's did not -- the first poll a few seconds later would
      // silently change the number. Safe on a brand-new audit with zero
      // citations: resolveAuditDimensionsAndHeadline's own batched
      // resolver fills in an explicit zero/insufficient_data result for
      // an audit id with no matching rows, never a crash.
      const { mentionedCount, sampleCount, medianPosition, rankedCount } =
        await resolveAuditDimensionsAndHeadline(tx, auditId);

      // "Usually about N minutes", only when there's real history for
      // this exact answer count (lib/audit/typical-duration.ts) --
      // replaces the old flat "Estimated 1-2 minutes" guess. Only
      // meaningful once tc is known.
      const typicalDurationMinutes =
        tc !== null ? await getTypicalDurationMinutes(tx, currentUser.organizationId, tc) : null;

      return {
        type: "running" as const,
        audit,
        brand,
        answeredCount,
        auditCost,
        mentionedCount,
        sampleCount,
        medianPosition,
        rankedCount,
        ec,
        pc,
        rc,
        tc,
        typicalDurationMinutes,
      };
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
    // Audit #36: every "k of n" on this page -- the headline, its CI, the
    // per-engine rows, the Responses tab sentence -- reads these counts:
    // successful everyday (organic, run 1) answers. A failed call writes
    // no citations row (engine_call_failures instead), so it is never in
    // n; the directory panel's own count uses the same predicate
    // (lib/directories/citation-counts.ts).
    const {
      dimensions: dimensionResults,
      headline: headlineResult,
      sampleCount: distinctSampleCount,
      mentionedCount: distinctMentionedCount,
      medianPosition,
      rankedCount: distinctRankedCount,
      sourcedCount: distinctSourcedCount,
      perEngine,
    } = await resolveAuditDimensionsAndHeadline(tx, auditId);

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
        // COALESCE: an unpriced live answer has a NULL cost and must still count as live.
        liveCallCount: sql<number>`COALESCE(SUM(CASE WHEN NOT (is_cache_hit OR COALESCE(llm_cost_usd::numeric = 0, false)) THEN 1 ELSE 0 END), 0)`,
        cachedCallCount: sql<number>`COALESCE(SUM(CASE WHEN is_cache_hit OR COALESCE(llm_cost_usd::numeric = 0, false) THEN 1 ELSE 0 END), 0)`,
      })
      .from(citations)
      .where(eq(citations.auditId, auditId));

    const finishedCost = await getAuditCost(tx, auditId);

    // Build 1 addendum, item 4: hipages Audit #29 (its FIRST audit)
    // showed "0 live · 200 cached" dated 18 Oct, but every answer was
    // actually reused from Get Plumbing #20 (16 Oct, ~44h earlier) --
    // the label was honest about "cached" but the page's own date
    // suggested the answers were fresh.
    //
    // "The cached-answer age must be the age of the content" (23 Oct),
    // item 2 -- this used to re-derive the age by querying llm_
    // response_cache for the oldest matching row's createdAt
    // (getOldestCacheEntryDate()), which has two problems: createdAt
    // is frozen at a row's FIRST-EVER insert, not its current content's
    // real fetch time, and the query runs at PAGE-VIEW time against
    // CURRENT cache state -- a later, unrelated audit could have
    // refreshed the same row in the meantime, making the computed age
    // describe the cache table in general, not what THIS audit's
    // citations actually reused. citations.cachedFromAt (set once, at
    // write time, from the real cache row's fetchedAt -- see lib/llm/
    // cache.ts's getCached()) is a permanent snapshot that can never
    // drift afterwards. NULL for a live call, and NULL for a citation
    // that reused a pre-migration-0095 cache row never refreshed since
    // (never invented) -- MIN() over NULLs-and-reals correctly ignores
    // the NULLs rather than treating them as the oldest possible date.
    const [{ oldestCachedAnswerAt }] = await tx
      .select({ oldestCachedAnswerAt: sql<Date | null>`MIN(${citations.cachedFromAt})` })
      .from(citations)
      .where(and(eq(citations.auditId, auditId), sql`${citations.cachedFromAt} IS NOT NULL`));

    let analysisData: {
      sentimentBreakdown: { positive: number; neutral: number; negative: number };
      perEngineData: EngineAnswerCounts[];
      competitorData: Array<{ name: string; mentions: number; isYou: boolean }>;
      topActions: Array<{
        id: string;
        title: string;
        expectedImpactScore: string;
        confidenceLabel: string;
        dimension: string;
        confidenceBasis: string | null;
        recommendationKey: string;
        createdAt: Date;
        displayBasis: DisplayBasis;
      }>;
    } | null = null;

    let responsesData: {
      rows: Array<{
        id: string;
        engine: string;
        prompt: string;
        runNumber: number;
        brandMentioned: boolean;
        isBrandedPrompt: boolean | null;
        position: number | null;
        mentionVerification: string | null;
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
      questions: Array<{
        prompt: string;
        isBrandedPrompt: boolean;
        perEngine: Record<string, { id: string; mentioned: boolean; verification: string | null }>;
      }>;
    } | null = null;

    if (activeTab === "analysis") {
      const sentRows = await tx
        .select({ sentiment: citations.sentimentLabel, count: count() })
        .from(citations)
        .where(
          and(
            eq(citations.auditId, auditId),
            eq(citations.brandMentioned, true),
            ORGANIC_ONLY,
            // Audit reliability, Part B: an unverified mention has no
            // confirmed sentiment ABOUT this business to chart.
            EXCLUDE_UNVERIFIED,
          ),
        )
        .groupBy(citations.sentimentLabel);
      const [openActions, ownerStatementsByBrand] = await Promise.all([
        tx
          .select({
            id: actionItems.id,
            title: actionItems.title,
            expectedImpactScore: actionItems.expectedImpactScore,
            confidenceLabel: actionItems.confidenceLabel,
            dimension: actionItems.dimension,
            confidenceBasis: actionItems.confidenceBasis,
            recommendationKey: actionItems.recommendationKey,
            createdAt: actionItems.createdAt,
            evidenceRefs: actionItems.evidenceRefs,
          })
          .from(actionItems)
          .where(
            and(
              eq(actionItems.auditId, auditId),
              eq(actionItems.organizationId, currentUser.organizationId),
              eq(actionItems.status, "open"),
            ),
          ),
        getOwnerDirectoryStatements(tx, [audit.brandId]),
      ]);
      const ownerStatements = ownerStatementsByBrand.get(audit.brandId) ?? [];
      // Top 3 by the displayed priority, not the stored one (displayImpact).
      const impactOrder: Record<string, number> = { high: 1, medium: 2 };
      const tActions = openActions
        .map(({ evidenceRefs, ...a }) => ({
          ...a,
          displayBasis: resolveDisplayBasis({ ...a, evidenceRefs }, ownerStatements),
        }))
        .sort((a, b) => (impactOrder[displayImpact(a)] ?? 3) - (impactOrder[displayImpact(b)] ?? 3))
        .slice(0, 3);

      // Task #46 Phase 1: was unconditionally `[{ name: brand.name, ...,
      // isYou: true }]` regardless of brands.competitors -- never showed
      // a real competitor even when the brand had some configured.
      // Real counts: the same organic run-1 citation set the headline
      // uses (the brand's own count is the headline k), text-matched per competitor
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
              // Vunnara Build 1, Part G.4: the cache key now includes
              // groundingMode -- read back under this audit's own
              // methodology, matching how it would have been written.
              const groundingMode =
                (audit.methodologyVersion ?? 1) >= 2 ? "grounded" : "memory_only";
              const cached = await getCached(
                r.prompt,
                r.llmModel,
                r.engine as Engine,
                groundingMode,
              );
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
          { name: brand.name, mentions: distinctMentionedCount, isYou: true },
          ...competitorCounts,
        ].sort((a, b) => b.mentions - a.mentions);
      }

      analysisData = {
        sentimentBreakdown: {
          positive: Number(sentRows.find((r) => r.sentiment === "positive")?.count ?? 0),
          neutral: Number(sentRows.find((r) => r.sentiment === "neutral")?.count ?? 0),
          negative: Number(sentRows.find((r) => r.sentiment === "negative")?.count ?? 0),
        },
        // An engine every call of which failed has no perEngine row: 0 of 0.
        perEngineData: (audit.engines ?? []).map(
          (engine) =>
            perEngine.find((r) => r.engine === engine) ?? {
              engine,
              sampleCount: 0,
              mentionedCount: 0,
            },
        ),
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
          isBrandedPrompt: citations.isBrandedPrompt,
          // Audit reliability, Part B: null means "not mentioned" or a
          // legacy row from before this column existed -- both display
          // the plain "Mentioned" badge, unchanged. Only the literal
          // 'unverified' switches to the "Possible mention" wording.
          mentionVerification: citations.mentionVerification,
          // Vunnara (21 Oct, hotfix: "Usually #16") -- the stored
          // position column is never selected here any more; `position`
          // is added back below from recomputeCitationPositions' own
          // real, read-time rank instead.
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

      // Vunnara (21 Oct, hotfix: "Usually #16") -- this per-answer badge
      // ("Mentioned · Position #N") used to show rawRows' own stored
      // `position` column directly: the same stale character-offset
      // heuristic as the headline card above, just not yet fixed here.
      // recomputeCitationPositions re-derives it from this row's own
      // real text instead, bounded to this one page's worth of rows
      // (<= pageSize, in-process, no extra query), never the stored
      // column.
      const rowsWithRealPosition = (
        await recomputeCitationPositions(rows, { name: brand.name, domain: brand.domain })
      ).map((r) => ({ ...r, position: r.realPosition }));

      const [{ distinctResponseCount }] = await tx
        .select({
          distinctResponseCount: sql<number>`COUNT(DISTINCT (${citations.engine}, ${citations.prompt}, ${citations.responseSnippet}))`,
        })
        .from(citations)
        .where(eq(citations.auditId, auditId));

      // Vunnara Build 1, Part H: a per-question overview, grouped by
      // whether the question counts toward the score (organic) or only
      // mentions the brand's own name (branded, never counted) -- run_
      // number = 1 only, the one real result per (engine, prompt); every
      // other run is a byte-identical cache replay (task SSS), so
      // scanning them would just repeat the same question under a
      // different label. Unpaginated: a full prompt pack is a few dozen
      // rows at most, not a cost concern.
      const questionRows = await tx
        .select({
          id: citations.id,
          prompt: citations.prompt,
          engine: citations.engine,
          isBrandedPrompt: citations.isBrandedPrompt,
          brandMentioned: citations.brandMentioned,
          mentionVerification: citations.mentionVerification,
        })
        .from(citations)
        .where(and(eq(citations.auditId, auditId), eq(citations.runNumber, 1)))
        .orderBy(citations.prompt, citations.engine);

      const questionMap = new Map<
        string,
        {
          prompt: string;
          isBrandedPrompt: boolean;
          perEngine: Record<string, { id: string; mentioned: boolean; verification: string | null }>;
        }
      >();
      for (const r of questionRows) {
        const existing = questionMap.get(r.prompt);
        const cell = { id: r.id, mentioned: r.brandMentioned, verification: r.mentionVerification };
        if (existing) {
          existing.perEngine[r.engine] = cell;
        } else {
          questionMap.set(r.prompt, {
            prompt: r.prompt,
            isBrandedPrompt: r.isBrandedPrompt ?? false,
            perEngine: { [r.engine]: cell },
          });
        }
      }
      const questions = [...questionMap.values()];

      responsesData = {
        rows: rowsWithRealPosition,
        filteredTotal: Number(filteredCount),
        distinctResponseCount: Number(distinctResponseCount),
        page,
        pageSize,
        questions,
      };
    }

    // Part D: read-time, batched (no N+1) -- how many of this audit's
    // organic/run-1 answers cite each of this brand's relevant registry
    // directories, and whether any cited URL is the owner's own
    // confirmed profile (brand_directory_listings, Part C).
    const directoryCitations = await getDirectoryCitationsForAudit(tx, auditId, brand);

    // Audit reliability, Part A, item 5: one batched, grouped count --
    // never one query per engine -- feeding formatFailureBreakdown's
    // "N failed: X search tool errors, Y timeouts" text below.
    const failureRows = await tx
      .select({
        engine: engineCallFailures.engine,
        errorClass: engineCallFailures.errorClass,
        count: count(),
      })
      .from(engineCallFailures)
      .where(eq(engineCallFailures.auditId, auditId))
      .groupBy(engineCallFailures.engine, engineCallFailures.errorClass);

    return {
      type: "complete" as const,
      audit,
      brand,
      directoryCitations,
      failureRows,
      totalCitations,
      realResponseCount,
      dimensionResults,
      headlineResult,
      medianPosition,
      distinctSampleCount,
      distinctMentionedCount,
      distinctRankedCount,
      distinctSourcedCount,
      liveCallCount,
      cachedCallCount,
      auditCost: finishedCost,
      oldestCachedAnswerAt,
      analysisData,
      responsesData,
    };
  });

  // Handle running/pending/failed view (returned early from transaction)
  if (result.type === "running") {
    const {
      audit,
      brand,
      answeredCount,
      auditCost,
      mentionedCount,
      sampleCount,
      medianPosition,
      rankedCount,
      ec,
      pc,
      rc,
      tc,
      typicalDurationMinutes,
    } = result;
    return (
      <>
        {/* "The Running audit page shows made-up numbers" (23 Oct),
            item 2 -- the breadcrumb and brand switcher used to show
            their generic defaults ("Detail" / "Select brand") for the
            entire running/pending/failed lifetime, only ever set by
            the finished-audit branch below. */}
        <SetBreadcrumbs crumbs={["Workspace", "Audits", `Audit #${audit.auditNumber}`]} />
        <SetCurrentBrand brandId={audit.brandId} />
        <AuditRunningView
          auditId={auditId}
          brandId={audit.brandId}
          brandName={brand.name}
          initialStatus={audit.status}
          initialProgress={tc !== null && tc > 0 ? Math.min(100, (answeredCount / tc) * 100) : 0}
          initialCost={auditCost.knownUsd}
          initialCostIncomplete={auditCost.incomplete}
          initialMentionedCount={mentionedCount}
          initialSampleCount={sampleCount}
          initialMedianPosition={medianPosition}
          initialRankedCount={rankedCount}
          initialCompletedCalls={answeredCount}
          totalCalls={tc}
          engineCount={ec}
          promptCount={pc}
          runCount={rc}
          typicalDurationMinutes={typicalDurationMinutes}
          errorMessage={
            audit.status === "failed"
              ? ((audit.metadata as Record<string, string>)?.error ?? "Unknown error")
              : null
          }
        />
      </>
    );
  }

  const {
    audit,
    brand,
    directoryCitations,
    failureRows,
    totalCitations,
    realResponseCount,
    analysisData,
    responsesData,
    auditCost,
  } = result;

  // Task #46 (fix: stored value contradicting its own CI): value, CI and
  // scored/insufficient_data state for every dimension were already
  // resolved inside the transaction above, all from the same read-time
  // citations computation (lib/scoring/resolve-audit-dimensions.ts) --
  // distinctSampleCount/distinctMentionedCount are exposed alongside it
  // purely for display text below (e.g. the "Not mentioned in any of N
  // answers" subtitle), not recomputed separately.
  const {
    dimensionResults,
    headlineResult,
    medianPosition,
    distinctSampleCount,
    distinctMentionedCount,
    distinctRankedCount,
    distinctSourcedCount,
  } = result;
  const mentionRate = engineAnswerLine({
    sampleCount: distinctSampleCount,
    mentionedCount: distinctMentionedCount,
  }).rate;
  // Position and Source citation show the counts they were computed
  // from, never their 0-100 scores (lib/scoring/measured-display.ts).
  const mentionDetailCounts = {
    mentionedCount: distinctMentionedCount,
    rankedCount: distinctRankedCount,
    medianPosition,
    sourcedCount: distinctSourcedCount,
  };
  const posDim = dimensionResults.position;
  const sentDim = dimensionResults.sentiment;
  const ctxDim = dimensionResults.context;
  const accDim = dimensionResults.accuracy;
  const liveCallCount = Number(result.liveCallCount);
  const cachedCallCount = Number(result.cachedCallCount);
  const oldestCachedAnswerAt = result.oldestCachedAnswerAt;

  // Task #46 Phase 2, Part C: "N LLM calls" conflated the NOMINAL count
  // (engines x prompts x runsPerPrompt -- a pure configuration product,
  // unaffected by how many of those were actually cache replays) with
  // real network/cache activity. "Prompt x engine pairs" is the TRUE
  // distinct-prompt-execution count (engines x prompts, no runs
  // multiplier); each pair's runsPerPrompt calls then split into real
  // (live) vs cached, which is what liveCallCount/cachedCallCount
  // measure directly from the DB rather than assume from config.
  const promptEnginePairs = (audit.engines?.length ?? 1) * (audit.promptsCount ?? 10);

  // Value-band colour for the Sentiment card below -- so its number can
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

  // Vunnara (21 Oct, hotfix: "Usually #16"): Position's own not_ranked
  // reason -- distinct from the shared not_measured tooltip above. Real
  // mentions exist; none of them sat inside a numbered or bulleted list
  // the extractListRank-based read-time recompute could read a rank
  // from (lib/scoring/resolve-audit-dimensions.ts).
  const notRankedTooltip = "Mentioned, but not inside a numbered or bulleted list we could rank";

  // Vunnara (19 Oct, post-aa83b3a): Frequency moved out of this grid --
  // it's the headline now, shown prominently above, never one of
  // several equally-weighted tiles. No "Weight" column either: there's
  // no blend left to show a weight for. This card is "when you're
  // mentioned" detail (Position/Sentiment/Context/Source citation)
  // only, never shown as if it still fed the headline number.
  const dimensions = [
    {
      key: "position",
      name: "Position",
      desc: "Typical rank when listed",
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
            {audit.promptsCount ?? 0} questions
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
            {audit.completedAt &&
              ` · ${formatInOrgTimezone(new Date(audit.completedAt), audit.organizationId, "d MMM yyyy")}`}
            {audit.startedAt &&
              audit.completedAt &&
              (() => {
                const secs = Math.round(
                  (new Date(audit.completedAt).getTime() - new Date(audit.startedAt).getTime()) /
                    1000,
                );
                return ` · ${secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`}`;
              })()}
            <span title={`Provider usage: ${formatUsd(auditCost.knownUsd)}`}>
              {` · ${formatAudFromUsd(auditCost.knownUsd)} cost`}
              {auditCost.followUpAudCents > 0 &&
                ` + A$${formatAudCents(auditCost.followUpAudCents)} for follow-up checks`}
              {auditCost.incomplete && ` · ${COST_INCOMPLETE_LABEL}`}
            </span>
            {
              // Vunnara Build 1, Part F.2: "N questions × M engines = K
              // answers" -- the explicit multiplication, never "calls"
              // (every run after the first used to replay a cached
              // response, never an independent sample; Part F.1 removed
              // that replay entirely, but old audits' live/cached split
              // below still matters for a historical audit that has one).
              ` · ${audit.promptsCount ?? 10} questions × ${audit.engines?.length ?? 1} engines = ${promptEnginePairs} answers · ${liveCallCount} live · ${cachedCallCount} cached`
            }
            {
              // "The cached-answer age must be the age of the content"
              // (23 Oct), item 2 -- the real fetch time of THIS audit's
              // own reused answers (citations.cachedFromAt, set once at
              // write time -- never re-derived from current cache
              // state, which a later audit could have refreshed since).
              // Omitted, never guessed, when this audit reused nothing
              // (cachedCallCount === 0, so oldestCachedAnswerAt is NULL)
              // or when every reused row predates migration 0095 and
              // was never refreshed since (also NULL -- never invented).
              oldestCachedAnswerAt &&
                ` · reused answers fetched at ${formatInOrgTimezone(new Date(oldestCachedAnswerAt), audit.organizationId, "h:mmaaa, d MMM")} (${Math.round((Date.now() - new Date(oldestCachedAnswerAt).getTime()) / 3600000)}h old)`
            }
            {
              // Vunnara Build 1, Part G.7: "Method: web-grounded (v2)"
              // vs "memory-only (v1)" -- which answer-gathering
              // methodology this specific audit ran under, never
              // inferred from the current build's default.
              ` · Method: ${methodologyLabel(audit.methodologyVersion)}`
            }
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 32 }}>
          {/* Vunnara (19 Oct, post-aa83b3a), "the headline is the
              mention rate": no more weighted 5-dimension blend --
              production audit #30 (Omega Services) showed how badly
              that misled (6 of 37 mentions blended to 56.6, while 1 of
              37 -- ranked first, cited -- would have scored ~62, HIGHER
              than the more-visible brand). This IS the Frequency
              DimensionResult, shown as a plain mention rate. */}
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-tertiary)",
            }}
          >
            Visibility
          </div>
          {headlineResult.status !== "scored" ? (
            <>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-mono)",
                  marginTop: 4,
                }}
              >
                —
              </div>
              <div
                style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4, maxWidth: 220 }}
              >
                No successful answers were collected for this audit.
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  color: headlineColor(headlineResult),
                  fontFamily: "var(--font-mono)",
                  marginTop: 4,
                }}
              >
                {headlineResult.value.toFixed(0)}%
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-mono)",
                  marginTop: 2,
                }}
              >
                Mentioned in {distinctMentionedCount} of {distinctSampleCount} answer
                {distinctSampleCount === 1 ? "" : "s"} · 95% CI {headlineResult.ci.lower.toFixed(0)}
                –{headlineResult.ci.upper.toFixed(0)}%
              </div>
            </>
          )}
          {
            // Build 1 addendum, item 6 / audit reliability Part A,
            // item 5: say plainly, right at the headline, WHY a failed
            // search shrank the real sample behind this number (never
            // just a bare count) -- the breakdown card below repeats
            // this in full sentence form; this is the compact version
            // next to the number itself.
            (() => {
              const breakdown = formatFailureBreakdown(failureRows);
              if (!breakdown) return null;
              return (
                <div style={{ fontSize: 10, color: "var(--warning)", marginTop: 4, maxWidth: 220 }}>
                  {breakdown}, not counted
                </div>
              );
            })()
          }
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
              When you're mentioned
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 24px" }}>
              Visibility (above) is how often you're mentioned at all. These describe HOW you appear
              in the {distinctMentionedCount} mention{distinctMentionedCount === 1 ? "" : "s"} that
              happened — none of them change the Visibility number itself. Sentiment and Context
              have no real classifier behind them yet, so they're always "Not yet measured".
              {
                // Build 1 addendum, item 6 / audit reliability Part A,
                // item 5: say plainly WHY when a failed search shrank
                // the real sample behind these numbers.
                (() => {
                  const breakdown = formatFailureBreakdown(failureRows);
                  if (!breakdown) return null;
                  return ` ${breakdown} this audit, excluded from every count on this page — only successful answers are counted.`;
                })()
              }
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 16,
              }}
            >
              {dimensions.map((d) => {
                // Audit #36: Position and Source citation show the counts
                // they were computed from -- "#4", "3 of 3" -- never their
                // 0-100 score or its interval bar (lib/scoring/measured-
                // display.ts says why). Sentiment/Context have no real
                // classifier behind them at all (task #46 Phase 3, Part C),
                // so they're always "Not yet measured" -- a different state
                // from Position's "not ranked" (real mentions, none inside a
                // list) and from "not mentioned" (nothing to measure).
                const card =
                  d.key === "position"
                    ? positionCard(mentionDetailCounts)
                    : d.key === "accuracy"
                      ? sourceCitationCard(mentionDetailCounts)
                      : null;
                const measured = card?.kind === "measured" ? card : null;
                const notRanked = card?.kind === "not_ranked";
                const notMentioned = card?.kind === "not_mentioned";
                const notMeasured = card === null && d.result.status === "not_measured";
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
                        color: measured ? "var(--text-primary)" : "var(--text-tertiary)",
                        fontFamily: "var(--font-mono)",
                        marginBottom: 8,
                      }}
                      aria-label={
                        notMeasured
                          ? "Not yet measured"
                          : notRanked
                            ? "Mentioned but not ranked"
                            : notMentioned
                              ? "Not mentioned — insufficient data"
                              : undefined
                      }
                      title={
                        notMeasured ? notMeasuredTooltip : notRanked ? notRankedTooltip : undefined
                      }
                    >
                      {measured ? measured.value : notMentioned ? "N/A" : "—"}
                    </div>
                    {measured ? (
                      <>
                        <p style={{ fontSize: 10, color: "var(--text-tertiary)", margin: 0 }}>
                          {measured.detail}
                        </p>
                        {measured.smallSampleNote && (
                          <p
                            style={{
                              fontSize: 10,
                              color: "var(--text-secondary)",
                              margin: "4px 0 0",
                            }}
                          >
                            {measured.smallSampleNote}
                          </p>
                        )}
                      </>
                    ) : notRanked ? (
                      <p
                        style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "0 0 6px" }}
                        title={notRankedTooltip}
                      >
                        Mentioned but not ranked
                      </p>
                    ) : notMeasured ? (
                      <p
                        style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "0 0 6px" }}
                        title={notMeasuredTooltip}
                      >
                        Not yet measured
                      </p>
                    ) : (
                      <p style={{ fontSize: 10, color: "var(--text-tertiary)", margin: "0 0 6px" }}>
                        Not mentioned
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3-col grid; one column at phone width so the per-engine rows never wrap */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
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
                  margin: "0 0 4px",
                }}
              >
                Per-engine performance
              </h3>
              <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "0 0 16px" }}>
                Mentions in successful answers to everyday questions
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {analysisData.perEngineData.map((e) => {
                  // Audit #36: "k of n" with n = this engine's successful
                  // everyday answers -- the same rows the headline sums, so
                  // the k's and n's add up to its "k of n". A failed call
                  // is never in n; it gets its own line, with the reason
                  // breakdown on hover.
                  const line = engineAnswerLine(e);
                  const engineFailures = failureRows.filter((r) => r.engine === e.engine);
                  const failedNote = failedNotCountedNote(
                    engineFailures.reduce((sum, r) => sum + r.count, 0),
                  );
                  const rate = e.sampleCount > 0 ? (e.mentionedCount / e.sampleCount) * 100 : null;
                  return (
                    <div key={e.engine}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          justifyContent: "space-between",
                          gap: 12,
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ENGINE_DISPLAY[e.engine] ?? e.engine}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            fontFamily: "var(--font-mono)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {line.rate ? `${line.counts} · ${line.rate}` : line.counts}
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
                            width: `${rate ?? 0}%`,
                            background: rate != null ? headlineColorVar(rate) : "transparent",
                          }}
                        />
                      </div>
                      {failedNote && (
                        <p
                          style={{ fontSize: 10, color: "var(--warning)", margin: "6px 0 0" }}
                          title={formatFailureBreakdown(engineFailures) ?? undefined}
                        >
                          {failedNote}
                        </p>
                      )}
                    </div>
                  );
                })}
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

          {/* Directories AI cited (Part D) */}
          <DirectoriesCitedPanel
            rows={directoryCitations.results.map((r) => ({
              key: r.directory.key,
              name: r.directory.name,
              citedCount: r.citedCount,
              citedUrls: r.citedUrls,
              ownerProfileCited: r.ownerProfileCited,
            }))}
            totalAnswers={directoryCitations.totalAnswers}
          />

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
                  // Build 1 addendum, item 1: a legacy row's priority
                  // badge goes muted + "· unverified" instead of its
                  // real impact color -- never a confirmed-looking red
                  // "High" next to a title stating the claim as fact.
                  const legacy = isLegacyConfidence(a.confidenceBasis);
                  const impact = displayImpact(a);
                  const tone = legacy
                    ? "var(--text-tertiary)"
                    : (toneMap[impact] ?? "var(--text-tertiary)");
                  const badgeBg = legacy
                    ? "color-mix(in srgb, var(--text-tertiary) 15%, transparent)"
                    : `color-mix(in srgb, ${toneMap[impact] ?? "var(--text-tertiary)"} 15%, transparent)`;
                  const priorityLabel = displayPriorityLabel(
                    labelMap[impact] ?? impact,
                    a.confidenceBasis,
                  );
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
                          background: badgeBg,
                          color: tone,
                        }}
                      >
                        {priorityLabel}
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
                          {displayRecommendationTitle(a)}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {dimensionLabel(a.dimension)} &middot;{" "}
                          {
                            displayBasisLabels(
                              a.displayBasis,
                              new Date(a.createdAt),
                              currentUser.organizationId,
                            ).text
                          }
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
            <strong style={{ color: "var(--text-primary)" }}>{distinctMentionedCount}</strong> of{" "}
            {distinctSampleCount} answers to everyday customer questions (questions that don&apos;t
            name your business){mentionRate && ` (${mentionRate} mention rate)`} — {totalCitations}{" "}
            total stored &middot;{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {responsesData.distinctResponseCount}
            </strong>{" "}
            distinct real responses (the rest are 48h-cache replays)
          </p>

          {/* Vunnara Build 1, Part H: every question this audit asked,
              grouped by whether it counts toward the Visibility Score
              (organic) or only asks about the brand by name (branded --
              a mention there is expected, so it's never counted). Each
              engine's Yes/No links down into the filtered evidence card
              below (run_number = 1 only, the one real result). */}
          <div style={{ marginBottom: 24 }}>
            {(["organic", "branded"] as const).map((kind) => {
              const groupQuestions = responsesData!.questions.filter((q) =>
                kind === "branded" ? q.isBrandedPrompt : !q.isBrandedPrompt,
              );
              if (groupQuestions.length === 0) return null;
              return (
                <div key={kind} style={{ marginBottom: 16 }}>
                  <h3
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      margin: "0 0 4px",
                    }}
                  >
                    {kind === "organic"
                      ? "Counted in your score"
                      : "Mentions your name, not counted"}
                  </h3>
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 10px" }}>
                    {kind === "organic"
                      ? "These questions don't name the brand — how often it still comes up is what the Visibility Score measures."
                      : "These questions ask about the brand directly, so a mention here is expected and isn't part of the score."}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {groupQuestions.map((q) => (
                      <div
                        key={q.prompt}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 12px",
                          borderRadius: 6,
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-default)",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ flex: 1, fontSize: 13, color: "var(--text-secondary)" }}>
                          &ldquo;{q.prompt}&rdquo;
                        </span>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                          {(audit.engines ?? []).map((engine) => {
                            const result = q.perEngine[engine];
                            if (!result) return null;
                            // Audit reliability, Part B: a third, distinct
                            // state for a name match that isn't confirmed
                            // as this business -- never folded into
                            // "Yes" (it isn't counted) or "No" (it did
                            // match a name), and links through to the
                            // same Responses row that spells out why.
                            const unverified = result.mentioned && result.verification === "unverified";
                            const label = unverified ? "Maybe" : result.mentioned ? "Yes" : "No";
                            return (
                              <Link
                                key={engine}
                                href={`${tabUrl("responses", {
                                  engine,
                                  status: result.mentioned ? "mentioned" : "not_mentioned",
                                })}#r-${result.id}`}
                                scroll={false}
                                title={`${ENGINE_DISPLAY[engine] ?? engine}: ${
                                  unverified
                                    ? "Possible mention, not confirmed as your business"
                                    : result.mentioned
                                      ? "Mentioned"
                                      : "Not mentioned"
                                }`}
                                style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  padding: "2px 7px",
                                  borderRadius: 9999,
                                  textDecoration: "none",
                                  background: unverified
                                    ? "var(--warning-soft)"
                                    : result.mentioned
                                      ? "var(--success-soft)"
                                      : "var(--accent-muted)",
                                  color: unverified
                                    ? "var(--warning)"
                                    : result.mentioned
                                      ? "var(--success)"
                                      : "var(--text-tertiary)",
                                }}
                              >
                                {ENGINE_DISPLAY[engine] ?? engine}: {label}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

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
                  id={`r-${c.id}`}
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
                        background: !c.brandMentioned
                          ? "var(--danger-soft)"
                          : c.mentionVerification === "unverified"
                            ? "var(--warning-soft)"
                            : "var(--success-soft)",
                        color: !c.brandMentioned
                          ? "var(--danger)"
                          : c.mentionVerification === "unverified"
                            ? "var(--warning)"
                            : "var(--success)",
                      }}
                    >
                      {/* Audit reliability, Part B: a name match ("Omega
                          Services") isn't necessarily THIS business --
                          mentionVerification null (not mentioned, or a
                          legacy row) and every verified_* value keep the
                          existing "Mentioned" wording unchanged; only
                          'unverified' gets this distinct label. */}
                      {!c.brandMentioned
                        ? "Not mentioned"
                        : c.mentionVerification === "unverified"
                          ? "Possible mention, not confirmed as your business"
                          : `Mentioned · Position #${c.position ?? "—"}`}
                    </span>
                    {/* Vunnara Build 1, Part H: every row now says plainly
                        whether it counts toward the score. */}
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {c.isBrandedPrompt
                        ? "Mentions your name · not counted"
                        : c.brandMentioned && c.mentionVerification === "unverified"
                          ? "Not confirmed · not counted"
                          : "Counted in score"}
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
