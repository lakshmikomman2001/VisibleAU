import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, brands, citations, engineCallFailures } from "@/db/schema";
import { resolveEngineCoverage } from "@/lib/audit/engine-coverage";
import { engineCoverageLabel, fullyFailedEngines } from "@/lib/audit/engine-failure";
import {
  type GoogleSurfaceBlock,
  googleSurfaceBlock,
  loadGoogleSurfaceSummary,
} from "@/lib/audit/google-surfaces/summary";
import { auditModels } from "@/lib/audit/model-drift";
import { EXCLUDE_UNVERIFIED, ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { loadPrintableAgencyAssets } from "@/lib/branding/agency-assets";
import type { ReportSection } from "@/lib/communication/types";
import { getDirectoryCitationsForAudit } from "@/lib/directories/citation-counts";
import { classifySeverity } from "@/lib/drift/significance";
import type { DriftSeverity } from "@/lib/drift/types";
import { RESIDENCY_CONFIG } from "@/lib/governance/residency-config";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { methodologyChangeNote, methodologyLabel } from "@/lib/llm/methodology";
import { findModelDrift, type ModelDrift, modelDriftNote } from "@/lib/llm/model-drift";
import { modelSetDifference, sameModelSet } from "@/lib/llm/model-set";
import { categoryLabel } from "@/lib/prompts/templates";
import type { DimensionResult } from "@/lib/scoring/dimension-result";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";
import { type SovState, shareOfVoiceForBrands, sovLine } from "@/lib/visibility/share-of-voice";
import type { SovShare } from "@/lib/visibility/share-of-voice-display";
import { getSourceTypeCitationsForAudit } from "@/lib/visibility/source-type-citations";
import { TREND_MIN_AUDITS } from "@/lib/visibility/visibility-trend-aggregator";
import { resolveAgencyBranding } from "./agency-branding";
import { inReportPeriod, type ReportPeriodType, reportPeriodLabel } from "./report-period";
import { type ReportSectionFlags, reportSectionFlags } from "./report-sections";
import { type SearchResultsSeen, searchResultsSeen } from "./search-results";

/**
 * DEMO-BLOCKER (1 Nov), parts 2 and 5 -- everything the report PDF states,
 * resolved ONCE, from the same resolvers the audit page uses: the headline,
 * its Wilson interval and the 10-answer minimum (resolveOrganicDimensions),
 * position and source counts, the per-engine split, engine coverage and
 * failure reasons (resolveEngineCoverage), directory evidence
 * (getDirectoryCitationsForAudit) and share of voice (shareOfVoiceForBrands,
 * the one counter the Overview, Visibility page, audit page and wins feed
 * read). No second implementation of any of them.
 *
 * The weekly trend row (visibility_trends: mention_rate, citation_rate,
 * brand_archetype) is never read here: it counts distinct QUESTIONS
 * mentioned at least once, in any run, unverified matches included --
 * a different quantity from Visibility under the same name (diag-0111).
 *
 * A report is based on ONE audit (Sri, 1 Nov): the latest complete audit
 * in the period in which every engine answered; if none in the period had
 * every engine, the latest complete one (and the PDF says so). Answers are
 * never pooled across audits.
 */

/** The most audits the trend chart draws: the most recent ones, and the
 * caption says how many earlier ones are left out (2 Nov follow-up, item 2). */
export const TREND_MAX_POINTS = 8;
/** The app's own rule (lib/visibility/visibility-trend-aggregator.ts): below
 * this many audits a trend is a "Hypothesis". */
export const MIN_COMPARABLE_AUDITS_FOR_TREND = TREND_MIN_AUDITS.likely;

export type BasisReason =
  | "latest_full_in_period"
  | "latest_partial_in_period"
  | "latest_before_period"
  /** The audit the report was made from, no longer the rule's pick. */
  | "report_audit";

export type MatrixOutcome = "mentioned" | "not_mentioned" | "error";

export interface ReportEngineRow {
  /** "chatgpt" */
  engine: string;
  /** "ChatGPT" */
  name: string;
  /** Successful everyday answers, run 1 (the resolver's perEngine). */
  sampleCount: number;
  /** Of those, verified mentions. */
  mentionedCount: number;
  /** Failed calls for everyday questions. */
  failedEverydayCount: number;
  /** Failed calls for every question, branded included. */
  failedCount: number;
  /** Every one of this engine's calls failed. */
  fullyFailed: boolean;
  /** The plain reason (describeEngineFailure's label) when fullyFailed. */
  failureReason: string | null;
  /** Model ids this engine answered with, from the audit's own answers. */
  models: string[];
  /**
   * Claude only, and only when its everyday answers kept their web-search results (lib/reports/search-results.ts):
   * how many did, and in how many the brand's own site was among the results.
   */
  searchResults?: SearchResultsSeen;
}

export interface ReportMatrixRow {
  /** 1-based, in the order the audit asked them. */
  index: number;
  question: string;
  /** engine id -> one real answer's outcome. */
  cells: Record<string, MatrixOutcome>;
}

export interface ReportDirectoryRow {
  key: string;
  name: string;
  citedCount: number;
  /** A confirmed listing with its profile URL: only then is "your profile" checked. */
  ownerProfileLinked: boolean;
  /** Answers citing the owner's own profile page (0 when not linked). */
  ownerProfileCitedCount: number;
  ownerStatus: "listed" | "not_listed" | "unsure" | null;
}

export interface ReportTrendPoint {
  auditId: string;
  auditNumber: number;
  completedAt: string;
  /** The headline percentage, when the audit had enough answers. */
  value: number | null;
  ci: { lower: number; upper: number } | null;
  mentionedCount: number;
  sampleCount: number;
  enginesPlanned: number;
  enginesAnswered: number;
  /** A whole engine failed: drawn hollow, never compared with full audits. */
  partial: boolean;
  /**
   * "Mention detection" (6 Nov), part 6: ran under an earlier methodology than the basis audit -- like a
   * partial audit, drawn hollow and never compared (its detection could miss mentions the newer one finds).
   */
  earlierMethodology: boolean;
  /** On the first point under a newer methodology than the point before it: e.g. "Detection improved on
   * 7 Nov 2026" (lib/llm/methodology.ts methodologyChangeNote). Null everywhere else. */
  methodologyChange: string | null;
  /**
   * Methodology v2.2 (Sri's decision, 7 Nov), part 3: how this audit's models differ from the basis audit's,
   * e.g. "Claude Haiku 4.5, not Sonnet 4.6" (lib/llm/model-set.ts modelSetDifference) -- drawn hollow and
   * never compared, like a partial audit. Null when it asked the same engines for the same models.
   */
  otherModels: string | null;
  /** A provider answered this audit with another model than the one asked for, e.g. "Perplexity answered
   * with sonar instead of sonar-pro (12 of 13 answers)": drawn hollow, never compared. Null when none did. */
  modelDrift: string | null;
  /** The engines that answered nothing, with the plain reason
   * (describeEngineFailure's label); empty unless partial. */
  failedEngines: Array<{ name: string; reason: string }>;
  /** Like for like with the basis audit: every engine answered, the same
   * question pack, the same methodology and the same models, no model drift,
   * and a measured headline. */
  comparable: boolean;
  isBasis: boolean;
  inPeriod: boolean;
}

export interface ReportTrend {
  points: ReportTrendPoint[];
  comparableCount: number;
  minimum: number;
  /** Only when comparableCount >= minimum: first vs latest comparable audit,
   * judged by the drift rule (lib/drift/significance.ts: 95% CIs overlap or not). */
  change: { fromAuditNumber: number; toAuditNumber: number; severity: DriftSeverity } | null;
  /** Earlier audits that would be on the chart but for TREND_MAX_POINTS. */
  leftOut: number;
}

export interface ReportData {
  organizationId: string;
  generatedAt: string;
  brand: {
    id: string;
    name: string;
    domain: string;
    /** "Castle Hill" (suburb, else city); null when the brand has none. */
    locality: string | null;
    state: string | null;
    /** The brand's first confirmed category, as the app labels it. */
    vertical: string | null;
  };
  agency: {
    name: string | null;
    logoUrl: string | null;
    contactLine: string | null;
    footerText: string | null;
  };
  period: { type: ReportPeriodType; label: string };
  basis: {
    auditId: string;
    auditNumber: number;
    completedAt: string;
    startedAt: string | null;
    reason: BasisReason;
    /** lib/llm/methodology.ts's methodologyLabel for the basis audit's version. */
    methodology: string;
  };
  headline: DimensionResult;
  mentionedCount: number;
  sampleCount: number;
  rankedCount: number;
  medianPosition: number | null;
  sourcedCount: number;
  coverage: {
    enginesPlanned: number;
    enginesAnswered: number;
    /** "3 of 4 engines"; null when every engine answered. */
    label: string | null;
    note: string | null;
  };
  /** In the order the audit asked them. */
  engines: ReportEngineRow[];
  /** Sri's decision 6 (7 Nov): engines whose provider answered with a different model than the one asked
   * for (lib/llm/model-drift.ts), over the basis audit's answers -- what the audit page says too. */
  modelDrift: ModelDrift[];
  questions: { everyday: number; branded: number; perEngine: number | null };
  answers: { planned: number | null; answered: number; failed: number };
  matrix: ReportMatrixRow[];
  directories: { totalAnswers: number; rows: ReportDirectoryRow[] };
  /** Sri's decision (7 Nov): the everyday answers (the directories' own count) and how many cited a Reddit
   * page (lib/visibility/source-type-citations.ts) -- the report's Reddit finding reads it. */
  sources: { totalAnswers: number; reddit: number };
  /** One Share of Voice (7 Nov): lib/visibility/share-of-voice.ts's counts for the basis audit. */
  competitors: {
    configured: boolean;
    state: SovState;
    /** "Not enough answers" etc., for a state with no share. */
    stateDetail: string;
    /** Verified everyday mentions of the brand: the headline's k. */
    brandMentions: number;
    brandSharePct: number | null;
    totalMentions: number;
    smallSample: boolean;
    /** Each verifiable competitor's verified mentions and share. */
    rows: SovShare[];
    /** "1 competitor can't be verified: add its website in brand settings", or null. */
    note: string | null;
  };
  trend: ReportTrend;
  residency: { accountData: string; reportStorage: string };
  /** The report template's optional sections (part 5 point 5). */
  sections: ReportSectionFlags;
  /** Google AI surfaces (Phase 1, part 3): the basis audit's Google Search AI block, only when it ran with Google. */
  google?: GoogleSurfaceBlock;
}

export interface BasisCandidate {
  id: string;
  completedAt: Date;
  engines: string[] | null;
  promptsCount: number | null;
  metadata: unknown;
}

/**
 * Sri's rule (1 Nov): the latest complete audit in the period in which
 * every engine answered; else the latest complete audit in the period; else
 * (nothing finished in the period) the latest complete audit before it.
 * `complete` is the brand's complete audits, any order.
 */
export function pickBasisAudit<T extends BasisCandidate>(
  complete: readonly T[],
  inPeriod: (audit: T) => boolean,
  isBeforePeriod: (audit: T) => boolean,
): { audit: T; reason: BasisReason } | null {
  const newestFirst = [...complete].sort(
    (a, b) => b.completedAt.getTime() - a.completedAt.getTime(),
  );
  const period = newestFirst.filter(inPeriod);
  const full = period.find((a) => fullyFailedEngines(a).length === 0);
  if (full) return { audit: full, reason: "latest_full_in_period" };
  if (period[0]) return { audit: period[0], reason: "latest_partial_in_period" };
  const before = newestFirst.find(isBeforePeriod);
  return before ? { audit: before, reason: "latest_before_period" } : null;
}

function engineName(engine: string): string {
  return (ENGINE_DISPLAY_NAMES as Record<string, string>)[engine] ?? engine;
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/** A complete audit as the report reads it (loadCompleteAudits, loadCompleteAudit). */
const COMPLETE_AUDIT_COLUMNS = {
  id: audits.id,
  auditNumber: audits.auditNumber,
  completedAt: audits.completedAt,
  startedAt: audits.startedAt,
  engines: audits.engines,
  promptsCount: audits.promptsCount,
  metadata: audits.metadata,
  promptPackVersion: audits.promptPackVersion,
  methodologyVersion: audits.methodologyVersion,
};

export type CompleteAudit = Awaited<ReturnType<typeof loadCompleteAudits>>[number];

async function loadCompleteAudits(db: DbClient, organizationId: string, brandId: string) {
  const rows = await db
    .select(COMPLETE_AUDIT_COLUMNS)
    .from(audits)
    .where(
      and(
        eq(audits.brandId, brandId),
        eq(audits.organizationId, organizationId),
        eq(audits.status, "complete"),
        isNotNull(audits.completedAt),
      ),
    )
    .orderBy(desc(audits.completedAt))
    .limit(200);
  return rows.flatMap((a) => (a.completedAt ? [{ ...a, completedAt: a.completedAt }] : []));
}

/** One complete audit of the brand, as loadCompleteAudits reads it; null unless it's complete. */
export async function loadCompleteAudit(
  db: DbClient,
  organizationId: string,
  brandId: string,
  auditId: string,
): Promise<CompleteAudit | null> {
  const [row] = await db
    .select(COMPLETE_AUDIT_COLUMNS)
    .from(audits)
    .where(
      and(
        eq(audits.id, auditId),
        eq(audits.brandId, brandId),
        eq(audits.organizationId, organizationId),
        eq(audits.status, "complete"),
        isNotNull(audits.completedAt),
      ),
    );
  return row?.completedAt ? { ...row, completedAt: row.completedAt } : null;
}

function periodTests(input: {
  organizationId: string;
  periodType: ReportPeriodType;
  periodLabel: string;
}) {
  return {
    inPeriod: (a: { completedAt: Date }) =>
      inReportPeriod(a.completedAt, input.periodLabel, input.periodType, input.organizationId),
    isBeforePeriod: (a: { completedAt: Date }) =>
      reportPeriodLabel(a.completedAt, input.periodType, input.organizationId) < input.periodLabel,
  };
}

/**
 * The audit a new report is based on (generated_reports.audit_id), by
 * pickBasisAudit's rule. Null when the brand has no complete audit.
 */
export async function selectReportBasis(
  db: DbClient,
  input: {
    organizationId: string;
    brandId: string;
    periodType: ReportPeriodType;
    periodLabel: string;
  },
): Promise<{ auditId: string; auditNumber: number; reason: BasisReason } | null> {
  const complete = await loadCompleteAudits(db, input.organizationId, input.brandId);
  const { inPeriod, isBeforePeriod } = periodTests(input);
  const picked = pickBasisAudit(complete, inPeriod, isBeforePeriod);
  return picked
    ? { auditId: picked.audit.id, auditNumber: picked.audit.auditNumber, reason: picked.reason }
    : null;
}

/**
 * The period a manual "Generate report" is for when none was chosen (2 Nov
 * follow-up, item 1): the Sydney week (or month) of the audit the report
 * would be based on -- pickBasisAudit's pick for the current period. On a
 * Monday whose week has no audit yet, that's the week that just ended, not
 * one that has barely started. No complete audit: the current period.
 */
export async function defaultReportPeriodLabel(
  db: DbClient,
  input: { organizationId: string; brandId: string; periodType: ReportPeriodType; now?: Date },
): Promise<string> {
  const current = reportPeriodLabel(
    input.now ?? new Date(),
    input.periodType,
    input.organizationId,
  );
  const complete = await loadCompleteAudits(db, input.organizationId, input.brandId);
  const { inPeriod, isBeforePeriod } = periodTests({ ...input, periodLabel: current });
  const picked = pickBasisAudit(complete, inPeriod, isBeforePeriod);
  return picked
    ? reportPeriodLabel(picked.audit.completedAt, input.periodType, input.organizationId)
    : current;
}

/**
 * The basis audit's measured evidence, read one way: its answers and failed calls, the directories and
 * source types its everyday answers cited, share of voice, the per-engine rows and the question matrix.
 * buildReportData reads it for the PDF, and lib/reports/audit-findings.ts for the audit page's "from this
 * audit" actions (Sri's decision, 7 Nov), so the page and the PDF can't list different actions for the
 * same audit. `resolved` holds the basis audit's resolveOrganicDimensions; `coverage` is its
 * resolveEngineCoverage.
 */
export async function basisAuditEvidence(
  db: DbClient,
  {
    brand,
    basis,
    resolved,
    coverage,
    now,
  }: {
    brand: typeof brands.$inferSelect;
    basis: CompleteAudit;
    resolved: Awaited<ReturnType<typeof resolveOrganicDimensions>>;
    coverage: Awaited<ReturnType<typeof resolveEngineCoverage>>;
    now: Date;
  },
) {
  const [answerRows, failureRows, directoryCitations, shareOfVoice, sourceTypes] =
    await Promise.all([
      db
        .select({
          engine: citations.engine,
          prompt: citations.prompt,
          promptIndex: citations.promptIndex,
          organic: sql<boolean>`(${ORGANIC_ONLY})`,
          mentioned: sql<boolean>`(${citations.brandMentioned} = true AND ${EXCLUDE_UNVERIFIED})`,
          llmModel: citations.llmModel,
          llmModelAnswered: citations.llmModelAnswered,
          citedSources: citations.citedSources,
        })
        .from(citations)
        .where(and(eq(citations.auditId, basis.id), eq(citations.runNumber, 1))),
      db
        .select({
          engine: engineCallFailures.engine,
          prompt: engineCallFailures.prompt,
          promptIndex: engineCallFailures.promptIndex,
          isBrandedPrompt: engineCallFailures.isBrandedPrompt,
        })
        .from(engineCallFailures)
        .where(eq(engineCallFailures.auditId, basis.id)),
      getDirectoryCitationsForAudit(
        db,
        basis.id,
        { id: brand.id, region: brand.region, categories: brand.categories },
        now,
      ),
      shareOfVoiceForBrands(
        db,
        [
          {
            id: brand.id,
            name: brand.name,
            competitors: brand.competitors,
            competitorWebsites: brand.competitorWebsites,
            latest: basis,
          },
        ],
        resolved,
      ).then(([sov]) => sov),
      getSourceTypeCitationsForAudit(db, basis.id),
    ]);

  // Everyday questions, in the order the audit asked them: every answer
  // and every failed call for one, so a question no engine answered still
  // gets its row.
  const questionOrder = new Map<string, number>();
  const noteQuestion = (prompt: string, promptIndex: number | null) => {
    const order = promptIndex ?? Number.MAX_SAFE_INTEGER;
    const seen = questionOrder.get(prompt);
    if (seen === undefined || order < seen) questionOrder.set(prompt, order);
  };
  for (const r of answerRows) if (r.organic) noteQuestion(r.prompt, r.promptIndex);
  for (const r of failureRows) if (!r.isBrandedPrompt) noteQuestion(r.prompt, r.promptIndex);
  const everydayQuestions = [...questionOrder.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([prompt]) => prompt);

  const plannedEngines = basis.engines?.length
    ? basis.engines
    : [...new Set(answerRows.map((r) => r.engine))].sort();

  const matrix: ReportMatrixRow[] = everydayQuestions.map((question, i) => {
    const cells: Record<string, MatrixOutcome> = {};
    for (const engine of plannedEngines) {
      const answer = answerRows.find(
        (r) => r.organic && r.engine === engine && r.prompt === question,
      );
      cells[engine] = answer ? (answer.mentioned ? "mentioned" : "not_mentioned") : "error";
    }
    return { index: i + 1, question, cells };
  });

  const brandedQuestions = new Set([
    ...answerRows.filter((r) => !r.organic).map((r) => r.prompt),
    ...failureRows.filter((r) => r.isBrandedPrompt).map((r) => r.prompt),
  ]);

  const fullyFailed = new Set(fullyFailedEngines(basis));
  const engines: ReportEngineRow[] = plannedEngines.map((engine) => {
    const counts = resolved.get(basis.id)?.perEngine.find((p) => p.engine === engine);
    const failure = coverage.failures.find((f) => f.engine === engine);
    // Only Claude's stored sources include uncited search results; the other engines' are citations alone.
    const searchResults =
      engine === "claude"
        ? searchResultsSeen(
            answerRows.filter((r) => r.organic && r.engine === engine),
            brand.domain,
          )
        : null;
    return {
      ...(searchResults ? { searchResults } : {}),
      engine,
      name: engineName(engine),
      sampleCount: counts?.sampleCount ?? 0,
      mentionedCount: counts?.mentionedCount ?? 0,
      failedEverydayCount: failureRows.filter((r) => r.engine === engine && !r.isBrandedPrompt)
        .length,
      failedCount: failureRows.filter((r) => r.engine === engine).length,
      fullyFailed: fullyFailed.has(engine),
      failureReason: failure ? failure.reason.label : null,
      models: [
        ...new Set(
          answerRows
            .filter((r) => r.engine === engine && r.llmModel)
            .map((r) => r.llmModel as string),
        ),
      ].sort(),
    };
  });

  return {
    answerRows,
    failureRows,
    directoryCitations,
    shareOfVoice,
    sources: {
      totalAnswers: sourceTypes.totalAnswers,
      reddit: sourceTypes.answersCiting.reddit_thread ?? 0,
    },
    everydayQuestions,
    brandedQuestions,
    plannedEngines,
    matrix,
    engines,
  };
}

/** The fields of the report that come straight from the basis audit's evidence -- the PDF's, and the
 * audit page's evidence actions (lib/reports/audit-findings.ts), from the one function. */
export function evidenceFields(
  basis: CompleteAudit,
  basisResolved: NonNullable<
    ReturnType<Awaited<ReturnType<typeof resolveOrganicDimensions>>["get"]>
  >,
  coverage: Awaited<ReturnType<typeof resolveEngineCoverage>>,
  evidence: Awaited<ReturnType<typeof basisAuditEvidence>>,
) {
  return {
    mentionedCount: basisResolved.mentionedCount,
    sampleCount: basisResolved.sampleCount,
    rankedCount: basisResolved.rankedCount,
    medianPosition: basisResolved.medianPosition,
    sourcedCount: basisResolved.sourcedCount,
    coverage: {
      enginesPlanned: coverage.enginesPlanned,
      enginesAnswered: coverage.enginesAnswered,
      label: coverage.label,
      note: coverage.note,
    },
    engines: evidence.engines,
    questions: {
      everyday: evidence.everydayQuestions.length,
      branded: evidence.brandedQuestions.size,
      perEngine: basis.promptsCount,
    },
    directories: {
      totalAnswers: evidence.directoryCitations.totalAnswers,
      rows: evidence.directoryCitations.results.map((r) => ({
        key: r.directory.key,
        name: r.directory.name,
        citedCount: r.citedCount,
        ownerProfileLinked: r.ownerProfileLinked,
        ownerProfileCitedCount: r.ownerProfileCitedCount,
        ownerStatus: r.ownerStatus,
      })),
    },
    sources: evidence.sources,
  };
}

/**
 * What the report's evidence rules read (report-rules.ts, report-findings.ts): the PDF passes its whole
 * ReportData, the audit page lib/reports/audit-findings.ts's auditFindingsData -- both from
 * basisAuditEvidence and evidenceFields.
 */
export type FindingsData = Pick<
  ReportData,
  | "engines"
  | "coverage"
  | "questions"
  | "directories"
  | "sources"
  | "sampleCount"
  | "mentionedCount"
  | "rankedCount"
  | "medianPosition"
  | "sourcedCount"
> & {
  basis: Pick<ReportData["basis"], "auditNumber">;
  competitors: Pick<ReportData["competitors"], "rows">;
};

export interface BuildReportDataInput {
  organizationId: string;
  brandId: string;
  periodType: ReportPeriodType;
  periodLabel: string;
  /** The audit the report was generated from (generated_reports.audit_id);
   * when null the rule above picks it. */
  auditId?: string | null;
  /** The report template's sections; none means every optional section. */
  sections?: readonly ReportSection[] | null;
  now?: Date;
}

/** Null when the brand has no complete audit to base a report on. */
export async function buildReportData(
  db: DbClient,
  input: BuildReportDataInput,
): Promise<ReportData | null> {
  const { organizationId, periodType, periodLabel } = input;
  const now = input.now ?? new Date();

  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.organizationId, organizationId)));
  if (!brand) return null;

  const complete = await loadCompleteAudits(db, organizationId, brand.id);
  type Candidate = (typeof complete)[number];
  const { inPeriod, isBeforePeriod } = periodTests(input);

  // The audit the report was made from (generated_reports.audit_id) keeps
  // the rule's reason only while the rule would still pick it; a later
  // audit in the period changes what "the latest" is, so the report then
  // just says it's the audit it was made from.
  const rulePick = pickBasisAudit(complete, inPeriod, isBeforePeriod);
  const pinned = input.auditId ? complete.find((a) => a.id === input.auditId) : undefined;
  const picked = pinned
    ? {
        audit: pinned,
        reason: rulePick?.audit.id === pinned.id ? rulePick.reason : ("report_audit" as const),
      }
    : rulePick;
  if (!picked) return null;
  const basis = picked.audit;

  const isFull = (a: Candidate) => fullyFailedEngines(a).length === 0;
  const samePack = (a: Candidate) => (a.promptPackVersion ?? 1) === (basis.promptPackVersion ?? 1);
  const sameMethodology = (a: Candidate) =>
    (a.methodologyVersion ?? 1) === (basis.methodologyVersion ?? 1);
  const sameMethod = (a: Candidate) => samePack(a) && sameMethodology(a);

  // The trend: every audit in the period, the basis itself, and earlier
  // ones with the basis audit's question pack -- partial ones included,
  // drawn hollow and never compared (2 Nov follow-up, item 2: a Week 45
  // report left out #37 without a word). "Mention detection" (6 Nov), part
  // 6: an earlier methodology is treated the same way -- shown, hollow,
  // labelled where it changes, never compared. The most recent
  // TREND_MAX_POINTS of them; `complete` is newest first.
  const trendEligible = complete.filter(
    (a) => a.id === basis.id || inPeriod(a) || (a.completedAt < basis.completedAt && samePack(a)),
  );
  const trendAudits = trendEligible.slice(0, TREND_MAX_POINTS).reverse();

  const resolved = await resolveOrganicDimensions(db, [
    ...new Set([basis.id, ...trendAudits.map((a) => a.id)]),
  ]);
  const basisResolved = resolved.get(basis.id);
  if (!basisResolved) return null;

  const coverage = await resolveEngineCoverage(db, basis);
  // Each partial trend audit's failed engines and reason, for its caption line.
  const trendCoverage = new Map(
    await Promise.all(
      trendAudits
        .filter((a) => a.id !== basis.id && !isFull(a))
        .map(async (a) => [a.id, await resolveEngineCoverage(db, a)] as const),
    ),
  );
  trendCoverage.set(basis.id, coverage);

  const [evidence, assetRows] = await Promise.all([
    basisAuditEvidence(db, { brand, basis, resolved, coverage, now }),
    // 2 Nov: the newest workspace-wide row (the same one Account -> Report
    // branding saves into), whatever duplicates the old save left; nothing
    // on a plan without report branding, so the cover says "Powered by" only.
    loadPrintableAgencyAssets(db, organizationId, brand.id),
  ]);
  const { answerRows, failureRows, shareOfVoice, plannedEngines, matrix } = evidence;

  // Part 5 point 4: field by field -- a brand row with no agency name no
  // longer hides the workspace row's.
  const agency = resolveAgencyBranding(assetRows.brand, assetRows.workspace);

  // Methodology v2.2 (Sri's decision, 7 Nov), part 3: and the same models as the basis audit, with no model
  // drift on either side -- each audit's from its answers (lib/audit/model-drift.ts auditModels). An audit with
  // other models is drawn hollow and labelled, like a partial one, and never compared.
  const trendModels = await auditModels(db, [basis.id, ...trendAudits.map((a) => a.id)]);
  const modelsOf = (a: Candidate) => ({
    models: trendModels.get(a.id)?.models ?? {},
    engines: a.engines ?? [],
  });
  const driftOf = (a: Candidate) => trendModels.get(a.id)?.drift ?? [];
  const basisDrifted = driftOf(basis).length > 0;
  const sameModels = (a: Candidate) =>
    sameModelSet(trendModels.get(a.id)?.models, trendModels.get(basis.id)?.models);
  // Google AI surfaces (Phase 1): counted in the headline or not, the same as the basis audit.
  const sameGoogleBasis = (a: Candidate) =>
    (resolved.get(a.id)?.googleIncluded === true) === (basisResolved?.googleIncluded === true);
  const isComparable = (a: Candidate) =>
    !basisDrifted &&
    isFull(a) &&
    sameMethod(a) &&
    sameModels(a) &&
    sameGoogleBasis(a) &&
    driftOf(a).length === 0 &&
    resolved.get(a.id)?.headline.status === "scored";
  const points: ReportTrendPoint[] = trendAudits.map((a, i) => {
    const r = resolved.get(a.id);
    const headline = r?.headline;
    const planned = a.engines?.length ?? 0;
    return {
      auditId: a.id,
      auditNumber: a.auditNumber,
      completedAt: a.completedAt.toISOString(),
      value: headline?.status === "scored" ? headline.value : null,
      ci: headline?.status === "scored" ? headline.ci : null,
      mentionedCount: r?.mentionedCount ?? 0,
      sampleCount: r?.sampleCount ?? 0,
      enginesPlanned: planned,
      enginesAnswered: planned - fullyFailedEngines(a).length,
      partial: engineCoverageLabel(a) !== null,
      earlierMethodology: !sameMethodology(a),
      methodologyChange:
        i > 0
          ? methodologyChangeNote(
              trendAudits[i - 1].methodologyVersion,
              a.methodologyVersion,
              a.completedAt,
            )
          : null,
      otherModels: modelSetDifference(modelsOf(a), modelsOf(basis)),
      modelDrift: driftOf(a).length > 0 ? driftOf(a).map(modelDriftNote).join("; ") : null,
      failedEngines: (trendCoverage.get(a.id)?.failures ?? []).map((f) => ({
        name: engineName(f.engine),
        reason: f.reason.label,
      })),
      comparable: isComparable(a),
      isBasis: a.id === basis.id,
      inPeriod: inPeriod(a),
    };
  });
  const comparable = points.filter((p) => p.comparable);
  const first = comparable[0];
  const last = comparable[comparable.length - 1];
  const change =
    comparable.length >= MIN_COMPARABLE_AUDITS_FOR_TREND &&
    first?.value != null &&
    last?.value != null &&
    first.ci &&
    last.ci
      ? {
          fromAuditNumber: first.auditNumber,
          toAuditNumber: last.auditNumber,
          severity: classifySeverity(last.value, first.value, last.ci, first.ci),
        }
      : null;

  // Google AI surfaces (Phase 1, part 3): absent for a basis audit that ran without Google.
  const googleSummary = await loadGoogleSurfaceSummary(db, basis.id);

  const region = (dataType: string) =>
    RESIDENCY_CONFIG.find((r) => r.dataType === dataType)?.storageRegion ?? "";

  return {
    organizationId,
    generatedAt: now.toISOString(),
    brand: {
      id: brand.id,
      name: brand.name,
      domain: brand.domain,
      locality: clean(brand.suburb) ?? clean(brand.city),
      state: clean(brand.state),
      vertical: brand.categories[0] ? categoryLabel(brand.categories[0]) : null,
    },
    agency,
    period: { type: periodType, label: periodLabel },
    basis: {
      auditId: basis.id,
      auditNumber: basis.auditNumber,
      completedAt: basis.completedAt.toISOString(),
      startedAt: basis.startedAt ? basis.startedAt.toISOString() : null,
      reason: picked.reason,
      methodology: methodologyLabel(basis.methodologyVersion),
    },
    headline: basisResolved.headline,
    ...evidenceFields(basis, basisResolved, coverage, evidence),
    modelDrift: findModelDrift(answerRows),
    answers: {
      planned: basis.promptsCount != null ? basis.promptsCount * plannedEngines.length : null,
      answered: answerRows.length,
      failed: failureRows.length,
    },
    matrix,
    competitors: {
      configured: brand.competitors.length > 0,
      state: shareOfVoice.state,
      stateDetail: sovLine(shareOfVoice, organizationId).detail,
      brandMentions: shareOfVoice.brandMentions,
      brandSharePct: shareOfVoice.sharePct,
      totalMentions: shareOfVoice.totalMentions,
      smallSample: shareOfVoice.smallSample,
      rows: shareOfVoice.competitors,
      note: sovLine(shareOfVoice, organizationId).note,
    },
    trend: {
      points,
      comparableCount: comparable.length,
      minimum: MIN_COMPARABLE_AUDITS_FOR_TREND,
      change,
      leftOut: trendEligible.length - trendAudits.length,
    },
    residency: { accountData: region("database"), reportStorage: region("pdf_reports") },
    sections: reportSectionFlags(input.sections),
    ...(googleSummary ? { google: googleSurfaceBlock(googleSummary) } : {}),
  };
}
