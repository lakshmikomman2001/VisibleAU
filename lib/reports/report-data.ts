import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, brands, citations, engineCallFailures } from "@/db/schema";
import {
  type CompetitorMentionCount,
  countCompetitorMentions,
} from "@/lib/audit/competitor-mentions";
import { resolveEngineCoverage } from "@/lib/audit/engine-coverage";
import { engineCoverageLabel, fullyFailedEngines } from "@/lib/audit/engine-failure";
import { EXCLUDE_UNVERIFIED, ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { loadPrintableAgencyAssets } from "@/lib/branding/agency-assets";
import type { ReportSection } from "@/lib/communication/types";
import { getDirectoryCitationsForAudit } from "@/lib/directories/citation-counts";
import { classifySeverity } from "@/lib/drift/significance";
import type { DriftSeverity } from "@/lib/drift/types";
import { RESIDENCY_CONFIG } from "@/lib/governance/residency-config";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { methodologyLabel } from "@/lib/llm/methodology";
import { categoryLabel } from "@/lib/prompts/templates";
import type { DimensionResult } from "@/lib/scoring/dimension-result";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";
import { TREND_MIN_AUDITS } from "@/lib/visibility/visibility-trend-aggregator";
import { resolveAgencyBranding } from "./agency-branding";
import { inReportPeriod, type ReportPeriodType, reportPeriodLabel } from "./report-period";
import { type ReportSectionFlags, reportSectionFlags } from "./report-sections";

/**
 * DEMO-BLOCKER (1 Nov), parts 2 and 5 -- everything the report PDF states,
 * resolved ONCE, from the same resolvers the audit page uses: the headline,
 * its Wilson interval and the 10-answer minimum (resolveOrganicDimensions),
 * position and source counts, the per-engine split, engine coverage and
 * failure reasons (resolveEngineCoverage), directory evidence
 * (getDirectoryCitationsForAudit) and competitor counts
 * (countCompetitorMentions). No second implementation of any of them.
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
  /** The engines that answered nothing, with the plain reason
   * (describeEngineFailure's label); empty unless partial. */
  failedEngines: Array<{ name: string; reason: string }>;
  /** Like for like with the basis audit: every engine answered, the same
   * question pack and the same methodology, and a measured headline. */
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
    /** "web-grounded (v2)" */
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
  questions: { everyday: number; branded: number; perEngine: number | null };
  answers: { planned: number | null; answered: number; failed: number };
  matrix: ReportMatrixRow[];
  directories: { totalAnswers: number; rows: ReportDirectoryRow[] };
  competitors: { configured: boolean; rows: CompetitorMentionCount[] };
  trend: ReportTrend;
  residency: { accountData: string; reportStorage: string };
  /** The report template's optional sections (part 5 point 5). */
  sections: ReportSectionFlags;
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

async function loadCompleteAudits(db: DbClient, organizationId: string, brandId: string) {
  const rows = await db
    .select({
      id: audits.id,
      auditNumber: audits.auditNumber,
      completedAt: audits.completedAt,
      startedAt: audits.startedAt,
      engines: audits.engines,
      promptsCount: audits.promptsCount,
      metadata: audits.metadata,
      promptPackVersion: audits.promptPackVersion,
      methodologyVersion: audits.methodologyVersion,
    })
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
  const sameMethod = (a: Candidate) =>
    (a.promptPackVersion ?? 1) === (basis.promptPackVersion ?? 1) &&
    (a.methodologyVersion ?? 1) === (basis.methodologyVersion ?? 1);

  // The trend: every audit in the period, the basis itself, and earlier
  // ones with the basis audit's question pack and methodology -- partial
  // ones included, drawn hollow and never compared (2 Nov follow-up, item
  // 2: a Week 45 report left out #37 without a word). The most recent
  // TREND_MAX_POINTS of them; `complete` is newest first.
  const trendEligible = complete.filter(
    (a) => a.id === basis.id || inPeriod(a) || (a.completedAt < basis.completedAt && sameMethod(a)),
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

  const [answerRows, failureRows, directoryCitations, competitorRows, assetRows] =
    await Promise.all([
      db
        .select({
          engine: citations.engine,
          prompt: citations.prompt,
          promptIndex: citations.promptIndex,
          organic: sql<boolean>`(${ORGANIC_ONLY})`,
          mentioned: sql<boolean>`(${citations.brandMentioned} = true AND ${EXCLUDE_UNVERIFIED})`,
          llmModel: citations.llmModel,
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
      countCompetitorMentions(db, basis, brand.competitors),
      // 2 Nov: the newest workspace-wide row (the same one Account -> Report
      // branding saves into), whatever duplicates the old save left; nothing
      // on a plan without report branding, so the cover says "Powered by" only.
      loadPrintableAgencyAssets(db, organizationId, brand.id),
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
    const counts = basisResolved.perEngine.find((p) => p.engine === engine);
    const failure = coverage.failures.find((f) => f.engine === engine);
    return {
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

  // Part 5 point 4: field by field -- a brand row with no agency name no
  // longer hides the workspace row's.
  const agency = resolveAgencyBranding(assetRows.brand, assetRows.workspace);

  const isComparable = (a: Candidate) =>
    isFull(a) && sameMethod(a) && resolved.get(a.id)?.headline.status === "scored";
  const points: ReportTrendPoint[] = trendAudits.map((a) => {
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
    engines,
    questions: {
      everyday: everydayQuestions.length,
      branded: brandedQuestions.size,
      perEngine: basis.promptsCount,
    },
    answers: {
      planned: basis.promptsCount != null ? basis.promptsCount * plannedEngines.length : null,
      answered: answerRows.length,
      failed: failureRows.length,
    },
    matrix,
    directories: {
      totalAnswers: directoryCitations.totalAnswers,
      rows: directoryCitations.results.map((r) => ({
        key: r.directory.key,
        name: r.directory.name,
        citedCount: r.citedCount,
        ownerProfileLinked: r.ownerProfileLinked,
        ownerProfileCitedCount: r.ownerProfileCitedCount,
        ownerStatus: r.ownerStatus,
      })),
    },
    competitors: { configured: brand.competitors.length > 0, rows: competitorRows },
    trend: {
      points,
      comparableCount: comparable.length,
      minimum: MIN_COMPARABLE_AUDITS_FOR_TREND,
      change,
      leftOut: trendEligible.length - trendAudits.length,
    },
    residency: { accountData: region("database"), reportStorage: region("pdf_reports") },
    sections: reportSectionFlags(input.sections),
  };
}
