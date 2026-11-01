import { engineNameList } from "@/lib/audit/engine-failure";
import { directoryProfileStatus } from "@/lib/directories/profile-status";
import { MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE } from "@/lib/scoring/dimension-result";
import { type HeadlineColorBand, headlineColorBand } from "@/lib/scoring/headline-color";
import { positionCard, sourceCitationCard } from "@/lib/scoring/measured-display";
import { formatVisibilityPercent } from "@/lib/scoring/visibility-display";
import type { ReportData, ReportDirectoryRow, ReportEngineRow } from "./report-data";
import { reportDate, reportPeriodDisplay } from "./report-period";

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

/** "Visibility 18% · mentioned in 7 of 40 answers to everyday customer questions · 95% CI 9–32%" */
export function headlineSentence(data: ReportData): string {
  const h = headlineFigures(data);
  if (h.percent === null) return h.noFigureReason ?? "";
  return `Visibility ${h.percent} · mentioned in ${h.kOfN} ${plural(data.sampleCount, "answer")} to everyday customer questions · 95% CI ${h.ci}`;
}

/** "4 of 4 engines", or "3 of 4 engines · Claude: Provider spend limit reached (…)". */
export function coverageLine(data: ReportData): string {
  const base = `${data.coverage.enginesAnswered} of ${data.coverage.enginesPlanned} ${plural(data.coverage.enginesPlanned, "engine")}`;
  const failed = data.engines.filter((e) => e.fullyFailed);
  if (failed.length === 0) return base;
  return `${base} · ${failed.map((e) => `${e.name}: ${e.failureReason ?? "every call failed"}`).join(" · ")}`;
}

/** "ChatGPT 4 of 10", or "Claude not counted (13 errors)". */
export function engineCountLine(e: ReportEngineRow): string {
  if (e.fullyFailed)
    return `${e.name} not counted (${e.failedCount} ${plural(e.failedCount, "error")})`;
  return `${e.name} ${e.mentionedCount} of ${e.sampleCount}`;
}

/** The engines that answered, as "ChatGPT, Gemini and Perplexity". */
export function answeringEngineNames(data: ReportData): string {
  return engineNameList(data.engines.filter((e) => !e.fullyFailed).map((e) => e.engine));
}

const MENTION_DETAIL = (data: ReportData) => ({
  mentionedCount: data.mentionedCount,
  rankedCount: data.rankedCount,
  medianPosition: data.medianPosition,
  sourcedCount: data.sourcedCount,
});

/** "Typically #1 (5 of 5 mentions were in a ranked list)", or why there's no rank. */
export function positionLine(data: ReportData): string {
  const card = positionCard(MENTION_DETAIL(data));
  if (card.kind === "not_mentioned") return "Not mentioned in any answer";
  if (card.kind === "not_ranked") return "Mentioned, but never inside a ranked list";
  return `Typically ${card.value} (${card.detail})`;
}

/** "5 of 5 mentions linked a source". */
export function sourceLine(data: ReportData): string {
  const card = sourceCitationCard(MENTION_DETAIL(data));
  if (card.kind !== "measured") return "Not mentioned in any answer";
  return card.line;
}

export function periodFull(data: ReportData): string {
  return reportPeriodDisplay(data.period.label).full;
}

export function periodTitle(data: ReportData): string {
  return reportPeriodDisplay(data.period.label).title;
}

/** "Based on Audit #39, 1 Nov 2026". */
export function basisLine(data: ReportData): string {
  return `Based on Audit #${data.basis.auditNumber}, ${reportDate(new Date(data.basis.completedAt), data.organizationId)}`;
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
  }
}

/** The directories AI cited this audit, most-cited first (ties by name). */
export function citedDirectories(data: ReportData): ReportDirectoryRow[] {
  return data.directories.rows
    .filter((r) => r.citedCount > 0)
    .sort((a, b) => b.citedCount - a.citedCount || a.name.localeCompare(b.name));
}

/** "hipages cited in 9 of 30 answers · your profile: Not linked yet" -- the audit page's words. */
export function directoryLine(row: ReportDirectoryRow, totalAnswers: number): string {
  return `${row.name} cited in ${row.citedCount} of ${totalAnswers} ${plural(totalAnswers, "answer")} · your profile: ${directoryProfileStatus(row).label}`;
}

/**
 * "AI cited 7 directories 36 times; your profile was cited 0 times." --
 * counts only, and only claims "0" for directories whose profile is linked.
 */
export function directoryGapLine(data: ReportData): string | null {
  const cited = citedDirectories(data);
  if (cited.length === 0) return null;
  const total = cited.reduce((s, r) => s + r.citedCount, 0);
  const linked = cited.filter((r) => r.ownerProfileLinked);
  const own = linked.reduce((s, r) => s + r.ownerProfileCitedCount, 0);
  const head = `AI cited ${cited.length} ${plural(cited.length, "directory", "directories")} ${total} ${plural(total, "time")}`;
  if (linked.length === cited.length) {
    return `${head}; your profile was cited ${own} ${plural(own, "time")}.`;
  }
  if (linked.length === 0) {
    return `${head}; your profiles on them aren't linked yet, so we can't tell which citations were yours.`;
  }
  return `${head}; your linked profiles were cited ${own} ${plural(own, "time")}, and ${cited.length - linked.length} of the ${cited.length} aren't linked yet.`;
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
  for (const p of t.points.filter((p) => p.partial)) {
    lines.push(
      `Audit #${p.auditNumber} used ${p.enginesAnswered} of ${p.enginesPlanned} engines, so it isn't compared with full audits.`,
    );
  }
  if (t.comparableCount < t.minimum) {
    lines.push(`Not enough comparable audits for a trend yet (need ${t.minimum}).`);
  } else if (t.change) {
    lines.push(
      t.change.severity === "within_noise"
        ? `From Audit #${t.change.fromAuditNumber} to #${t.change.toAuditNumber} the change is within the margin of error: their 95% confidence intervals overlap.`
        : `From Audit #${t.change.fromAuditNumber} to #${t.change.toAuditNumber} Visibility ${t.change.severity === "significant_rise" ? "rose" : "fell"} by more than the margin of error: their 95% confidence intervals don't overlap.`,
    );
  }
  return lines;
}

/** "52 planned · 39 answered · 13 failed" */
export function answersLine(data: ReportData): string {
  const parts: string[] = [];
  if (data.answers.planned !== null) parts.push(`${data.answers.planned} planned`);
  parts.push(`${data.answers.answered} answered`);
  parts.push(`${data.answers.failed} failed`);
  return parts.join(" · ");
}

/** "ChatGPT (gpt-4o), Claude (no answers), ..." -- the real model ids from the audit's answers. */
export function modelsLine(data: ReportData): string {
  return data.engines
    .map((e) =>
      e.models.length > 0 ? `${e.name} (${e.models.join(", ")})` : `${e.name} (no answers)`,
    )
    .join(", ");
}

/** "Castle Hill, NSW" -- whatever of the two the brand has. */
export function locationText(data: ReportData): string | null {
  const parts = [data.brand.locality, data.brand.state].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(", ") : null;
}
