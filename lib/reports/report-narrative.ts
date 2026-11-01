import { engineNameList } from "@/lib/audit/engine-failure";
import { MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE } from "@/lib/scoring/dimension-result";
import { formatTypicalRank } from "@/lib/scoring/measured-display";
import { formatVisibilityPercent } from "@/lib/scoring/visibility-display";
import { type AllowedFacts, groundNarrative } from "./narrative-grounding";
import type { ReportData } from "./report-data";
import { citedDirectories, plural } from "./report-format";
import { competitorAhead, directoryGaps, failedEngines, silentEngines } from "./report-rules";

/**
 * DEMO-BLOCKER (1 Nov), part 3 -- "The picture, in plain English": the
 * report's headline sentence and three short paragraphs (visibility and
 * position; how the engines differ; the biggest gap), built from sentence
 * templates chosen by rules over ReportData. No LLM writes them. Every
 * sentence then goes through groundNarrative against the facts below, so
 * a number that isn't in the data can't be printed.
 */

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** "Omega Services' listings", "Acme's listings". */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** "seven" for 2-9, digits otherwise. */
export function countWord(n: number): string {
  return n >= 2 && n <= 9 ? WORDS[n] : String(n);
}

/**
 * How often, in words, deterministically: k of n as "about 1 in 6" (below
 * 35%), "about 4 in 10" (35% and up), "almost every" (95% and up) or
 * "every". Null when k is 0. `numbers` are the digits it prints.
 */
export function aboutHowOften(k: number, n: number): { phrase: string; numbers: string[] } | null {
  if (k <= 0 || n <= 0) return null;
  if (k >= n) return { phrase: "every", numbers: [] };
  const rate = k / n;
  if (rate >= 0.95) return { phrase: "almost every", numbers: [] };
  if (rate >= 0.35) {
    const tenths = String(Math.round(rate * 10));
    return { phrase: `about ${tenths} in 10`, numbers: [tenths, "10"] };
  }
  const oneIn = String(Math.round(1 / rate));
  return { phrase: `about 1 in ${oneIn}`, numbers: ["1", oneIn] };
}

/** Every fact the report's prose may state. */
export function allowedFacts(data: ReportData, extraNumbers: readonly string[] = []): AllowedFacts {
  const numbers = new Set<string>(extraNumbers);
  const percents = new Set<string>();
  const add = (...ns: number[]) => {
    for (const n of ns) numbers.add(String(n));
  };
  add(data.mentionedCount, data.sampleCount, data.rankedCount, data.sourcedCount);
  add(
    data.coverage.enginesPlanned,
    data.coverage.enginesAnswered,
    MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE,
  );
  add(data.questions.everyday, data.questions.branded);
  if (data.questions.perEngine !== null) add(data.questions.perEngine);
  if (data.headline.status === "scored") {
    percents.add(formatVisibilityPercent(data.headline.value));
    percents.add(`${data.headline.ci.lower.toFixed(0)}%`);
    percents.add(`${data.headline.ci.upper.toFixed(0)}%`);
  }
  for (const e of data.engines) {
    add(e.sampleCount, e.mentionedCount, e.failedCount, e.failedEverydayCount);
    if (e.sampleCount > 0) percents.add(`${Math.round((e.mentionedCount / e.sampleCount) * 100)}%`);
  }
  const cited = citedDirectories(data);
  add(data.directories.totalAnswers, cited.length);
  add(cited.reduce((s, r) => s + r.citedCount, 0));
  for (const r of cited) add(r.citedCount);
  for (const c of data.competitors.rows) add(c.mentions);
  const about = aboutHowOften(data.mentionedCount, data.sampleCount);
  for (const n of about?.numbers ?? []) numbers.add(n);

  const ranks = new Set<number>();
  if (data.medianPosition !== null) {
    ranks.add(Math.floor(data.medianPosition));
    ranks.add(Math.ceil(data.medianPosition));
  }
  const auditNumbers = new Set<number>([
    data.basis.auditNumber,
    ...data.trend.points.map((p) => p.auditNumber),
  ]);
  const claims = new Set<"trend_rise" | "trend_fall">();
  if (data.trend.change?.severity === "significant_rise") claims.add("trend_rise");
  if (data.trend.change?.severity === "significant_drop") claims.add("trend_fall");
  return {
    numbers,
    percents,
    ranks,
    auditNumbers,
    engines: new Set(data.engines.map((e) => e.name)),
    claims,
    names: [
      data.brand.name,
      ...data.competitors.rows.map((c) => c.name),
      ...cited.map((r) => r.name),
    ],
  };
}

/** "AI mentions Omega Services in about 1 in 6 everyday answers". */
function headlineText(data: ReportData): string {
  const brand = data.brand.name;
  if (data.headline.status !== "scored") {
    return `Not enough answers yet for a Visibility figure for ${brand}`;
  }
  const about = aboutHowOften(data.mentionedCount, data.sampleCount);
  if (!about) return `AI didn't mention ${brand} in any of ${data.sampleCount} everyday answers`;
  return `AI mentions ${brand} in ${about.phrase} everyday answers`;
}

function visibilityParagraph(data: ReportData): string {
  const brand = data.brand.name;
  const n = data.sampleCount;
  if (data.headline.status !== "scored") {
    return `This audit collected ${n} successful ${plural(n, "answer")} to everyday customer questions, too few for a Visibility figure (it needs at least ${MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE}).`;
  }
  const about = aboutHowOften(data.mentionedCount, n);
  if (!about) {
    return `When local customers ask AI for help with the kind of work ${brand} does, ${brand} didn't come up in any of the ${n} answers we counted.`;
  }
  const lead = `When local customers ask AI for help with the kind of work ${brand} does, ${brand} comes up in **${about.phrase} answers**: ${data.mentionedCount} of the ${n} we counted.`;
  const m = data.mentionedCount;
  const sources =
    data.sourcedCount === m
      ? m === 1
        ? "and that mention linked a source"
        : "and every mention linked a source"
      : data.sourcedCount === 0
        ? `but none of the ${m} mentions linked a source`
        : `and ${data.sourcedCount} of the ${m} mentions linked a source`;
  if (data.rankedCount === 0 || data.medianPosition === null) {
    return `${lead} When it does appear, it isn't inside a ranked list, ${sources}.`;
  }
  const rank =
    data.medianPosition === 1
      ? "**typically listed first**"
      : `**typically listed at ${formatTypicalRank(data.medianPosition)}**`;
  return `${lead} When it does appear, it's ${rank}, ${sources}.`;
}

function enginesParagraph(data: ReportData): string | null {
  const brand = data.brand.name;
  const answered = data.engines.filter((e) => !e.fullyFailed && e.sampleCount > 0);
  const failed = failedEngines(data);
  const parts: string[] = [];
  if (answered.length === 1) {
    const e = answered[0];
    parts.push(
      `Only ${e.name} answered; it mentioned ${brand} in ${e.mentionedCount} of ${e.sampleCount} answers.`,
    );
  } else if (answered.length > 1) {
    const rates = new Set(answered.map((e) => e.mentionedCount / e.sampleCount));
    const withMentions = answered
      .filter((e) => e.mentionedCount > 0)
      .sort((a, b) => b.mentionedCount - a.mentionedCount || a.name.localeCompare(b.name));
    const silent = answered.filter((e) => e.mentionedCount === 0);
    if (withMentions.length === 0) {
      parts.push(
        `None of the ${countWord(answered.length)} engines that answered mentioned ${brand}.`,
      );
    } else if (rates.size === 1) {
      const e = answered[0];
      parts.push(
        `Each engine mentioned ${brand} in ${e.mentionedCount} of ${e.sampleCount} answers.`,
      );
    } else {
      const named = withMentions.map((e, i) =>
        i === 0
          ? `**${e.name}** mentioned ${brand} in ${e.mentionedCount} of ${e.sampleCount} answers`
          : `**${e.name}** in ${e.mentionedCount} of ${e.sampleCount}`,
      );
      const list =
        named.length <= 2
          ? named.join(" and ")
          : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
      const tail =
        silent.length > 0
          ? `, while **${engineNameList(silent.map((e) => e.engine))} didn't mention it at all**`
          : "";
      parts.push(`The engines don't agree. ${list}${tail}.`);
    }
  }
  if (failed.length > 0) {
    parts.push(`${engineNameList(failed.map((e) => e.engine))} couldn't be measured this time.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function gapParagraph(data: ReportData, diagnosisSection: string | null): string | null {
  const brand = data.brand.name;
  const see = diagnosisSection ? ` (see section ${diagnosisSection})` : "";
  const gaps = directoryGaps(data);
  if (gaps.length > 0) {
    const cited = citedDirectories(data);
    const total = cited.reduce((s, r) => s + r.citedCount, 0);
    const lead = `AI leans heavily on directories, citing ${countWord(cited.length)} of them ${total} times`;
    // Part 5 point 3: "your profile wasn't cited" only where it's linked.
    if (gaps.every((r) => !r.ownerProfileLinked)) {
      return `${lead}, and **we can't yet see whether any of those citations were ${possessive(brand)} own listings**: the profile links haven't been added. Adding them is the first step in this report${see}.`;
    }
    const own = cited.filter((r) => r.ownerProfileCitedCount > 0).length;
    const which =
      own === 0
        ? `**none of those citations linked ${possessive(brand)} own listings**`
        : `only ${countWord(own)} of them linked ${possessive(brand)} own listing`;
    return `${lead}, but ${which}. That is the clearest, most fixable gap in this report${see}.`;
  }
  const silent = silentEngines(data);
  if (silent.length > 0) {
    const names = engineNameList(silent.map((e) => e.engine));
    const n = silent[0].sampleCount;
    return silent.length === 1
      ? `The clearest gap is ${names}: it didn't mention ${brand} in any of its ${n} answers${see}.`
      : `The clearest gap is ${names}: neither mentioned ${brand} in any of their answers${see}.`;
  }
  const failed = failedEngines(data);
  if (failed.length > 0) {
    return `${engineNameList(failed.map((e) => e.engine))} couldn't be measured this time, so this report doesn't yet show how it sees ${brand}${see}.`;
  }
  const ahead = competitorAhead(data);
  if (ahead) {
    return `${ahead.name} was mentioned in ${ahead.mentions} of the same ${data.sampleCount} answers, more often than ${brand}${see}.`;
  }
  return null;
}

/** "**bold**" -> "bold": the narrative as plain text (stored, grounded). */
export function stripNarrativeMarkup(text: string): string {
  return text.replace(/\*\*/g, "");
}

export interface ReportNarrative {
  /** The executive summary's headline sentence, grounded. */
  headline: string;
  /** Up to three grounded paragraphs, with **emphasis** markers for the
   * PDF (stripNarrativeMarkup for plain text); empty when every sentence
   * was dropped. */
  paragraphs: string[];
  dropped: number;
}

/** `diagnosisSection`: the diagnosis section's number ("04") when it's in the report. */
export function reportNarrative(
  data: ReportData,
  options: { diagnosisSection?: string | null } = {},
): ReportNarrative {
  const diagnosisSection = options.diagnosisSection ?? null;
  const facts = allowedFacts(data, diagnosisSection ? [diagnosisSection] : []);
  const candidates = [
    visibilityParagraph(data),
    enginesParagraph(data),
    gapParagraph(data, diagnosisSection),
  ].filter((p): p is string => p !== null);
  const grounded = groundNarrative(candidates, facts);
  const headline = groundNarrative([headlineText(data)], facts, () => {}).paragraphs[0];
  return {
    headline: headline ?? `AI Visibility Report · ${data.brand.name}`,
    paragraphs: grounded.paragraphs,
    dropped: grounded.dropped,
  };
}
