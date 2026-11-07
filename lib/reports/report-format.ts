import { engineNameList } from "@/lib/audit/engine-failure";
import { MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE } from "@/lib/scoring/dimension-result";
import { type HeadlineColorBand, headlineColorBand } from "@/lib/scoring/headline-color";
import { formatVisibilityPercent } from "@/lib/scoring/visibility-display";
import type { ReportData, ReportDirectoryRow, ReportTrendPoint } from "./report-data";
import { reportPeriodDisplay } from "./report-period";

/**
 * DEMO-BLOCKER (1 Nov), part 2 -- the report's sentences, as pure
 * functions of ReportData. Every figure is the audit page's own: the same
 * rounding (formatVisibilityPercent), the same "k of n", the same 95% CI
 * format ("9–32%"), the same Position and Source-citation cards
 * (lib/scoring/measured-display.ts).
 */

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** "9–32%", exactly as the audit page prints the headline's interval. */
export function formatCi(ci: { lower: number; upper: number }): string {
  return `${ci.lower.toFixed(0)}–${ci.upper.toFixed(0)}%`;
}

export interface HeadlineFigures {
  /** "18%", or null when there weren't enough answers for a figure. */
  percent: string | null;
  value: number | null;
  band: HeadlineColorBand | null;
  /** "7 of 40" */
  kOfN: string;
  /** "9–32%", or null with no figure. */
  ci: string | null;
  /** Why there's no figure, when there isn't one. */
  noFigureReason: string | null;
}

export function headlineFigures(data: ReportData): HeadlineFigures {
  const kOfN = `${data.mentionedCount} of ${data.sampleCount}`;
  if (data.headline.status !== "scored") {
    return {
      percent: null,
      value: null,
      band: null,
      kOfN,
      ci: null,
      noFigureReason: `Not enough answers for a Visibility figure: ${data.sampleCount} successful ${plural(data.sampleCount, "answer")} to everyday questions (a figure needs at least ${MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE}).`,
    };
  }
  return {
    percent: formatVisibilityPercent(data.headline.value),
    value: data.headline.value,
    band: headlineColorBand(data.headline.value),
    kOfN,
    ci: formatCi(data.headline.ci),
    noFigureReason: null,
  };
}

/** "4 of 4 engines", or "3 of 4 engines · Claude: Provider spend limit reached (…)". */
export function coverageLine(data: ReportData): string {
  const base = `${data.coverage.enginesAnswered} of ${data.coverage.enginesPlanned} ${plural(data.coverage.enginesPlanned, "engine")}`;
  const failed = data.engines.filter((e) => e.fullyFailed);
  if (failed.length === 0) return base;
  return `${base} · ${failed.map((e) => `${e.name}: ${e.failureReason ?? "every call failed"}`).join(" · ")}`;
}

/** The engines that answered, as "ChatGPT, Gemini and Perplexity". */
export function answeringEngineNames(data: ReportData): string {
  return engineNameList(data.engines.filter((e) => !e.fullyFailed).map((e) => e.engine));
}

export function periodFull(data: ReportData): string {
  return reportPeriodDisplay(data.period.label).full;
}

export function periodTitle(data: ReportData): string {
  return reportPeriodDisplay(data.period.label).title;
}

/** Why that audit: the rule, in words. */
export function basisReasonText(data: ReportData): string {
  const period = periodTitle(data);
  switch (data.basis.reason) {
    case "latest_full_in_period":
      return `The latest complete audit in ${period} in which every engine answered.`;
    case "latest_partial_in_period":
      return `The latest complete audit in ${period}. No audit in this period had every engine answer.`;
    case "latest_before_period":
      return `No audit finished in ${period}, so this report uses the latest audit before it.`;
    case "report_audit":
      return `The audit this report was made from. Later audits in ${period} appear only in the trend.`;
  }
}

/** The directories AI cited this audit, most-cited first (ties by name). */
export function citedDirectories(data: Pick<ReportData, "directories">): ReportDirectoryRow[] {
  return data.directories.rows
    .filter((r) => r.citedCount > 0)
    .sort((a, b) => b.citedCount - a.citedCount || a.name.localeCompare(b.name));
}

/** A failure reason inside a sentence: "provider spend limit reached" (its parenthetical dropped). */
function reasonInSentence(label: string): string {
  const short = label.replace(/\s*\([^)]*\)\s*$/, "");
  return short.charAt(0).toLowerCase() + short.slice(1);
}

/** "Audit #37 used 3 of 4 engines (Claude: provider spend limit reached), so it's shown but not compared." */
export function partialTrendLine(p: ReportTrendPoint): string {
  const why = p.failedEngines.map((f) => `${f.name}: ${reasonInSentence(f.reason)}`).join("; ");
  return `Audit #${p.auditNumber} used ${p.enginesAnswered} of ${p.enginesPlanned} ${plural(p.enginesPlanned, "engine")}${why ? ` (${why})` : ""}, so it's shown but not compared.`;
}

/**
 * "Mention detection" (6 Nov), part 6: where the trend meets a newer methodology, e.g. "Detection improved on
 * 7 Nov 2026: audits before #41 used the earlier detection, so they're shown but not compared."
 */
export function methodologyChangeTrendLine(p: ReportTrendPoint): string | null {
  if (!p.methodologyChange) return null;
  return `${p.methodologyChange}: audits before #${p.auditNumber} used the earlier detection, so they're shown but not compared.`;
}

/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 3: a point drawn hollow and never compared -- a partial
 * audit, an earlier methodology, other models than the basis audit's, or a provider answering with another
 * model than the one asked for.
 */
export function trendPointHollow(p: ReportTrendPoint): boolean {
  return p.partial || p.earlierMethodology || p.otherModels !== null || p.modelDrift !== null;
}

/**
 * Methodology v2.2, part 3: "Audits #50–#51 used other models (Claude Haiku 4.5, not Sonnet 4.6), so they're
 * shown but not compared." -- one line for each run of consecutive audits with the same difference. A partial
 * audit or one under an earlier methodology has its own line already: one reason each, never two.
 */
export function otherModelsTrendLines(points: ReportTrendPoint[]): string[] {
  const lines: string[] = [];
  let run: ReportTrendPoint[] = [];
  const flush = () => {
    const [first, last] = [run[0], run[run.length - 1]];
    if (first) {
      lines.push(
        run.length === 1
          ? `Audit #${first.auditNumber} used other models (${first.otherModels}), so it's shown but not compared.`
          : `Audits #${first.auditNumber}–#${last.auditNumber} used other models (${first.otherModels}), so they're shown but not compared.`,
      );
    }
    run = [];
  };
  for (const p of points) {
    const listed = p.otherModels !== null && !p.partial && !p.earlierMethodology;
    if (listed && run[0]?.otherModels === p.otherModels) {
      run.push(p);
      continue;
    }
    flush();
    if (listed) run.push(p);
  }
  flush();
  return lines;
}

/**
 * Methodology v2.2, part 3: "Audit #53: Perplexity answered with sonar instead of sonar-pro (13 of 13
 * answers), so it's shown but not compared." Null when no provider did, or the audit has a line already.
 */
export function modelDriftTrendLine(p: ReportTrendPoint): string | null {
  if (!p.modelDrift || p.partial || p.earlierMethodology || p.otherModels !== null) return null;
  return `Audit #${p.auditNumber}: ${p.modelDrift}, so it's shown but not compared.`;
}

/** "The chart shows the latest 8 audits; 2 earlier audits are left out." -- null when none are. */
export function trendLeftOutLine(data: ReportData): string | null {
  const n = data.trend.leftOut;
  if (n <= 0) return null;
  return `The chart shows the latest ${data.trend.points.length} audits; ${n} earlier ${plural(n, "audit is", "audits are")} left out.`;
}

/** The trend, as measured -- never "trending up" unless the drift rule says the change is real. */
export function trendLines(data: ReportData): string[] {
  const t = data.trend;
  const lines: string[] = [];
  const shown = t.points.map((p) =>
    p.value === null ? `#${p.auditNumber}: not enough answers` : formatVisibilityPercent(p.value),
  );
  const numbers = t.points.map((p) => p.auditNumber);
  if (t.points.length > 1) {
    lines.push(`${shown.join(" → ")} across Audits #${numbers[0]}–#${numbers[numbers.length - 1]}`);
  }
  // 2 Nov follow-up, item 2: a partial audit is on the chart, hollow, and
  // the comparison below uses only like-for-like audits (trend.change).
  for (const p of t.points.filter((p) => p.partial)) lines.push(partialTrendLine(p));
  for (const p of t.points) {
    const change = methodologyChangeTrendLine(p);
    if (change) lines.push(change);
  }
  lines.push(...otherModelsTrendLines(t.points));
  for (const p of t.points) {
    const drift = modelDriftTrendLine(p);
    if (drift) lines.push(drift);
  }
  const leftOut = trendLeftOutLine(data);
  if (leftOut) lines.push(leftOut);
  const comparison = trendComparisonLine(data);
  if (comparison) lines.push(comparison);
  return lines;
}

/** The first vs latest like-for-like audit, by the drift rule; null with no comparison to state. */
export function trendComparisonLine(data: ReportData): string | null {
  const t = data.trend;
  if (t.comparableCount < t.minimum) {
    return `Not enough comparable audits for a trend yet (need ${t.minimum}).`;
  }
  if (!t.change) return null;
  return t.change.severity === "within_noise"
    ? `From Audit #${t.change.fromAuditNumber} to #${t.change.toAuditNumber} the change is within the margin of error: their 95% confidence intervals overlap.`
    : `From Audit #${t.change.fromAuditNumber} to #${t.change.toAuditNumber} Visibility ${t.change.severity === "significant_rise" ? "rose" : "fell"} by more than the margin of error: their 95% confidence intervals don't overlap.`;
}

/** "Castle Hill, NSW" -- whatever of the two the brand has. */
export function locationText(data: ReportData): string | null {
  const parts = [data.brand.locality, data.brand.state].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(", ") : null;
}
