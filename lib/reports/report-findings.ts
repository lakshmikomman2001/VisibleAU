import { engineNameList } from "@/lib/audit/engine-failure";
import { directoryProfileStatus } from "@/lib/directories/profile-status";
import { PRODUCT_NAME } from "@/lib/product";
import { formatTypicalRank, smallSampleNote } from "@/lib/scoring/measured-display";
import type { ReportData, ReportEngineRow } from "./report-data";
import { citedDirectories, plural } from "./report-format";
import { countWord } from "./report-narrative";
import {
  competitorAhead,
  directoryGaps,
  failedEngines,
  isPositionStrength,
  silentEngines,
} from "./report-rules";

/**
 * DEMO-BLOCKER (1 Nov), part 4 -- the diagnosis: up to three problems and
 * one strength, from rules evaluated in Sri's order --
 *   (a) directories cited at least twice that never linked the owner's profile
 *   (b) an engine with 0 mentions in 10+ answers while another has some
 *   (c) an engine that failed every question
 *   (d) strength: typically ranked #1-#3 and at least half the mentions sourced
 *   (e) a configured competitor named more often on the same answers
 * Every card's evidence lines are the measured counts, so no card exists
 * without evidence. (The Action Center's "directory-visibility"
 * recommendation reads the same directory evidence; it has no
 * equivalent of (b)-(e).)
 */

export type EvidenceTone = "pos" | "cmp" | "abs" | "plain";
export interface EvidencePart {
  text: string;
  tone: EvidenceTone;
}
export type EvidenceLine = EvidencePart[];

export type FindingRule = "a" | "b" | "c" | "d" | "e";
export type FindingKind = "risk" | "watch" | "strength";

export interface Finding {
  rule: FindingRule;
  kind: FindingKind;
  icon: "directory" | "silent" | "failed" | "strength" | "competitor";
  title: string;
  explanation: string;
  severity: { label: string; short: string; tone: "high" | "med" | "str" };
  evidenceLabel: string;
  evidence: EvidenceLine[];
  fix: string;
  recommendation: { title: string; detail: string };
}

const HIGH = { label: "High impact", short: "High", tone: "high" } as const;
const MEDIUM = { label: "Medium impact", short: "Medium", tone: "med" } as const;
const RERUN = { label: "Re-run", short: "Re-run", tone: "med" } as const;
const STRENGTH = { label: "Strength", short: "Strength", tone: "str" } as const;

/** "hipages, Word of Mouth and Localsearch" */
function nameList(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Monospace columns: pad each label to the longest. */
function padded(labels: string[]): string[] {
  const width = Math.max(...labels.map((l) => l.length));
  return labels.map((l) => l.padEnd(width, " "));
}

function directoryFinding(data: ReportData): Finding | null {
  const gaps = directoryGaps(data);
  if (gaps.length === 0) return null;
  const cited = citedDirectories(data);
  const total = cited.reduce((s, r) => s + r.citedCount, 0);
  const gapSum = gaps.reduce((s, r) => s + r.citedCount, 0);
  const notLinked = gaps.every((r) => !r.ownerProfileLinked);
  const names = gaps.map((r) => r.name);
  const labels = padded(names);
  const these =
    gaps.length === 1 ? "this directory" : `these ${countWord(gaps.length)} directories`;
  return {
    rule: "a",
    kind: "risk",
    icon: "directory",
    title: notLinked
      ? "AI cites these directories, and we can't yet see your listings on them"
      : "Your directory listings aren't the ones AI links",
    explanation: notLinked
      ? `AI engines answer local questions by citing directories. They cited ${countWord(cited.length)} ${plural(cited.length, "directory", "directories")} ${total} ${plural(total, "time")}; your profile links aren't added yet, so we can't check which citations were yours.`
      : `AI engines answer local questions by citing directories. They cited ${countWord(cited.length)} ${plural(cited.length, "directory", "directories")} ${total} ${plural(total, "time")}, but not your profile on ${these}.`,
    severity: HIGH,
    evidenceLabel: `Evidence · Audit #${data.basis.auditNumber} · ${data.directories.totalAnswers} everyday answers`,
    evidence: gaps.map((r, i) => {
      const status = directoryProfileStatus(r);
      return [
        { text: `${labels[i]} → `, tone: "plain" },
        {
          text: `cited in ${r.citedCount} of ${data.directories.totalAnswers} answers`,
          tone: "cmp",
        },
        { text: " · ", tone: "plain" },
        {
          text:
            status.kind === "not_linked"
              ? "your profile: not linked yet"
              : `your profile: ${status.cited}`,
          tone: "abs",
        },
      ];
    }),
    fix: notLinked
      ? `Add your ${names.join(" / ")} profile links in ${PRODUCT_NAME}, then claim or complete them`
      : `Complete and activate your profiles on ${these} first`,
    recommendation: notLinked
      ? {
          title: `Link your ${nameList(names)} ${plural(names.length, "profile")}`,
          detail: `They're cited in ${gapSum} of ${total} directory citations; add the links so we can check them.`,
        }
      : {
          title: `Complete your ${nameList(names)} ${plural(names.length, "profile")}`,
          detail: `They're cited in ${gapSum} of ${total} directory citations; none linked you.`,
        },
  };
}

const ENGINE_FIX: Record<string, { fix: string; title: string }> = {
  gemini: {
    fix: "Review your Google Business Profile: categories, services, hours and recent reviews",
    title: "Strengthen your Google Business Profile",
  },
};
const GENERIC_ENGINE_FIX = {
  fix: "Make sure your website and directory profiles name your services and suburbs plainly",
  title: "Make your services easy for AI to match",
};

function silentEngineFinding(data: ReportData): Finding | null {
  const silent = silentEngines(data);
  if (silent.length === 0) return null;
  const names = engineNameList(silent.map((e) => e.engine));
  const others = data.engines
    .filter((e) => !e.fullyFailed && e.mentionedCount > 0)
    .sort((a, b) => a.mentionedCount - b.mentionedCount || a.name.localeCompare(b.name));
  const rows: Array<{ e: ReportEngineRow; tone: EvidenceTone }> = [
    ...silent.map((e) => ({ e, tone: "abs" as const })),
    ...others.map((e, i) => ({
      e,
      tone: i === others.length - 1 ? ("pos" as const) : ("cmp" as const),
    })),
  ];
  const labels = padded(rows.map((r) => r.e.name));
  const advice = ENGINE_FIX[silent[0].engine] ?? GENERIC_ENGINE_FIX;
  const one = silent.length === 1;
  return {
    rule: "b",
    kind: "risk",
    icon: "silent",
    title: `${names} ${one ? "doesn't" : "don't"} mention you`,
    explanation: `${others.length === 1 ? "One engine recommends" : `${countWord(others.length)[0].toUpperCase()}${countWord(others.length).slice(1)} engines recommend`} you some of the time; ${names} didn't mention you in any of ${one ? "its" : "their"} answers.`,
    severity: HIGH,
    evidenceLabel: "Evidence · mentions per engine, everyday questions",
    evidence: rows.map((r, i) => [
      { text: `${labels[i]} → `, tone: "plain" },
      { text: `${r.e.mentionedCount} of ${r.e.sampleCount}`, tone: r.tone },
    ]),
    fix: advice.fix,
    recommendation: {
      title: advice.title,
      detail: silent
        .map((e) => `${e.name} mentioned you in ${e.mentionedCount} of ${e.sampleCount} answers.`)
        .join(" "),
    },
  };
}

/** "Provider spend limit reached (a monthly limit ...)" -> "provider spend limit reached". */
function shortReason(reason: string | null): string {
  if (!reason) return "every call failed";
  const head = reason.split(" (")[0];
  return head.charAt(0).toLowerCase() + head.slice(1);
}

function failedEngineFinding(data: ReportData): Finding | null {
  const failed = failedEngines(data);
  if (failed.length === 0) return null;
  const names = engineNameList(failed.map((e) => e.engine));
  const labels = padded(failed.map((e) => e.name));
  const planned = data.coverage.enginesPlanned;
  const asked = data.questions.perEngine;
  return {
    rule: "c",
    kind: "watch",
    icon: "failed",
    title: `${names} couldn't be measured this time`,
    explanation: `Every ${names} request failed for a provider reason, so we don't yet know how ${failed.length === 1 ? names : "they"} ${failed.length === 1 ? "sees" : "see"} you.`,
    severity: RERUN,
    evidenceLabel: "Evidence · engine coverage",
    evidence: failed.map((e, i) => [
      { text: `${labels[i]} → `, tone: "plain" },
      {
        text: `${e.failedCount} of ${asked ?? e.failedCount} ${plural(e.failedCount, "error")}`,
        tone: "abs",
      },
      { text: ` · ${shortReason(e.failureReason)} · `, tone: "plain" },
      { text: "not counted", tone: "cmp" },
    ]),
    fix: `Re-run the audit with all ${countWord(planned)} engines for a complete baseline`,
    recommendation: {
      title: `Re-run with all ${countWord(planned)} engines`,
      detail: `${names} ${failed.length === 1 ? "wasn't" : "weren't"} measured in this audit.`,
    },
  };
}

function competitorFinding(data: ReportData): Finding | null {
  const ahead = competitorAhead(data);
  if (!ahead) return null;
  const n = data.sampleCount;
  const labels = padded([ahead.name, "You"]);
  return {
    rule: "e",
    kind: "risk",
    icon: "competitor",
    title: `${ahead.name} is recommended more often`,
    explanation: `Across the same ${n} answers, AI named ${ahead.name} more often than you.`,
    severity: MEDIUM,
    evidenceLabel: "Evidence · share of voice, everyday answers",
    evidence: [
      [
        { text: `${labels[0]} → `, tone: "plain" },
        { text: `mentioned in ${ahead.mentions} of ${n} answers`, tone: "cmp" },
      ],
      [
        { text: `${labels[1]} → `, tone: "plain" },
        { text: `mentioned in ${data.mentionedCount} of ${n} answers`, tone: "abs" },
      ],
    ],
    fix: `Compare what AI says about ${ahead.name} with your own listings and pages`,
    recommendation: {
      title: `Close the gap with ${ahead.name}`,
      detail: `${ahead.name} was named in ${ahead.mentions} of ${n} answers; you in ${data.mentionedCount}.`,
    },
  };
}

function strengthFinding(data: ReportData): Finding | null {
  if (!isPositionStrength(data) || data.medianPosition === null) return null;
  const m = data.mentionedCount;
  const rank = formatTypicalRank(data.medianPosition);
  const first = data.medianPosition === 1;
  const sources =
    data.sourcedCount === m
      ? "every mention linked a source"
      : `${data.sourcedCount} of ${m} mentions linked a source`;
  const small = smallSampleNote(m);
  return {
    rule: "d",
    kind: "strength",
    icon: "strength",
    title: first
      ? "When you're mentioned, you're listed first"
      : "When you're mentioned, you're listed near the top",
    explanation: `When AI recommended you, it typically listed you ${first ? "first" : `at ${rank}`}, and ${sources}. That's a strong position to build on.`,
    severity: STRENGTH,
    evidenceLabel: `Evidence · your ${m} ${plural(m, "mention")}`,
    evidence: [
      [
        { text: "Ranked list   → ", tone: "plain" },
        { text: `${data.rankedCount} of ${m} · typically ${rank}`, tone: "pos" },
      ],
      [
        { text: "Source linked → ", tone: "plain" },
        { text: `${data.sourcedCount} of ${m}`, tone: "pos" },
        ...(small ? [{ text: ` · ${small.toLowerCase()}`, tone: "plain" as const }] : []),
      ],
    ],
    fix: "Keep the pages AI already cites up to date: they're doing the work",
    recommendation: {
      title: "Keep your cited pages current",
      detail: `${data.sourcedCount} of ${m} mentions linked a source; typically ranked ${rank}.`,
    },
  };
}

/** Up to three problems (rules a, b, c, e, in that order) and one strength (d), problems first. */
export function reportFindings(data: ReportData): Finding[] {
  const problems = [
    directoryFinding(data),
    silentEngineFinding(data),
    failedEngineFinding(data),
    competitorFinding(data),
  ]
    .filter((f): f is Finding => f !== null)
    .slice(0, 3);
  const strength = strengthFinding(data);
  return strength ? [...problems, strength] : problems;
}
