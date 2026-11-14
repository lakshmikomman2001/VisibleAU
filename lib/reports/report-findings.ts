import { engineNameList } from "@/lib/audit/engine-failure";
import { citedInAnswers, namedCitedInAnswersList } from "@/lib/directories/cited-in-answers";
import { linkedStateSentence } from "@/lib/directories/linked-state";
import { directoryProfileStatus } from "@/lib/directories/profile-status";
import { PRODUCT_NAME } from "@/lib/product";
import { formatTypicalRank, smallSampleNote } from "@/lib/scoring/measured-display";
import type { FindingsData, ReportEngineRow } from "./report-data";
import { citedDirectories, plural } from "./report-format";
import { countWord } from "./report-narrative";
import {
  competitorAhead,
  directoryGaps,
  failedEngines,
  isPositionStrength,
  redditCited,
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
 *   (f) Reddit pages cited in at least two everyday answers (Sri's decision, 7 Nov: the Action Center's
 *       Reddit advice used to fire on a low mention rate alone)
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

export type FindingRule = "a" | "b" | "c" | "d" | "e" | "f";
export type FindingKind = "risk" | "watch" | "strength";

export interface Finding {
  rule: FindingRule;
  kind: FindingKind;
  icon: "directory" | "silent" | "failed" | "strength" | "competitor" | "forum";
  title: string;
  explanation: string;
  severity: { label: string; short: string; tone: "high" | "med" | "str" };
  evidenceLabel: string;
  evidence: EvidenceLine[];
  fix: string;
  /** detail is absent when there's nothing measured to add (rule b without stored search results). */
  recommendation: { title: string; detail?: string };
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

/** "localsearch.com.au/profile/hero-home-services/yennora-nsw": host without www., path, no query. */
function pageShown(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

/** Monospace columns: pad each label to the longest. */
function padded(labels: string[]): string[] {
  const width = Math.max(...labels.map((l) => l.length));
  return labels.map((l) => l.padEnd(width, " "));
}

function directoryFinding(data: FindingsData): Finding | null {
  const gaps = directoryGaps(data);
  if (gaps.length === 0) return null;
  const cited = citedDirectories(data);
  const total = cited.reduce((s, r) => s + r.citedCount, 0);
  // 13 Nov, part 3: the recommendation names each directory its title names, with its own count.
  const gapCited = namedCitedInAnswersList(gaps, data.directories.totalAnswers);
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
    // 14 Nov, part 2: what's linked, from every cited directory -- not "your profile links aren't added yet" when one
    // is (Hero's Localsearch).
    explanation: `AI engines answer local questions by citing directories. They cited ${countWord(cited.length)} ${plural(cited.length, "directory", "directories")} ${total} ${plural(total, "time")}. ${linkedStateSentence(cited)}`,
    severity: HIGH,
    evidenceLabel: `Evidence · Audit #${data.basis.auditNumber} · ${data.directories.totalAnswers} everyday answers`,
    evidence: gaps.map((r, i) => {
      const status = directoryProfileStatus(r);
      return [
        { text: `${labels[i]} → `, tone: "plain" },
        {
          text: citedInAnswers(r.citedCount, data.directories.totalAnswers),
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
    // 9 Nov (part 6): in answers, as the evidence above it -- not "32 of 48 directory citations" (answer-directory
    // pairs), which read like a different denominator.
    // 13 Nov (part 9): when a cited page looks like the brand's own profile (lib/directories/own-profile.ts),
    // the recommendation names it -- the owner links it on the audit page with one click.
    recommendation: notLinked
      ? {
          title: `Link your ${nameList(names)} ${plural(names.length, "profile")}`,
          detail: (() => {
            const suggested = gaps.filter((r) => r.suggestedProfileUrl);
            if (suggested.length === 0) {
              return `${gapCited}; add your profile links in brand settings so we can match them with what AI cites.`;
            }
            const pages = suggested.map(
              (r) => `${pageShown(r.suggestedProfileUrl ?? "")} looks like your ${r.name} profile`,
            );
            const linkIt = `Link ${suggested.length === 1 ? "it" : "them"} under Directories AI cited, so we can match ${suggested.length === 1 ? "it" : "them"} with what AI cites.`;
            // 13 Nov, part 3: the directories with no suggested page are still named, with what to do.
            const others = gaps.filter((r) => !r.suggestedProfileUrl).map((r) => r.name);
            const rest =
              others.length > 0
                ? ` Add your ${nameList(others)} ${plural(others.length, "profile link")} in brand settings.`
                : "";
            return `${gapCited}. AI cited what looks like yours: ${pages.join("; ")}. ${linkIt}${rest}`;
          })(),
        }
      : {
          title: `Complete your ${nameList(names)} ${plural(names.length, "profile")}`,
          detail: `${gapCited}; none linked you.`,
        },
  };
}

const ENGINE_FIX: Record<string, { fix: string }> = {
  gemini: {
    fix: "Review your Google Business Profile: categories, services, hours and recent reviews",
  },
};
const GENERIC_ENGINE_FIX = {
  fix: "Make sure your website and directory profiles name your services and suburbs plainly",
};

/**
 * 9 Nov (part 6): the action's title states what was measured, never a cause the audit didn't measure (it said
 * "Make your services easy for AI to match" / "Strengthen your Google Business Profile"). The subtitle names a
 * reason only where the stored rows show one: whether the site was among Claude's web-search results
 * (lib/reports/search-results.ts). Otherwise none.
 *
 * 13 Nov, part 3 (Sri's live check): "Claude and Gemini didn't name you in any of 20 answers" gave only
 * Claude's reason. When any engine has a measured reason, the subtitle now covers every engine in the title:
 * each measured reason, then the engines whose stored answers keep only the pages they cited (no search
 * results), said plainly to have no measured reason.
 */
function silentEngineRecommendation(silent: ReportEngineRow[]): Finding["recommendation"] {
  const answers = silent.reduce((s, e) => s + e.sampleCount, 0);
  const title = `${engineNameList(silent.map((e) => e.engine))} didn't name you in any of ${answers} ${plural(answers, "answer")}`;
  const reasons: string[] = [];
  const unmeasured: ReportEngineRow[] = [];
  for (const e of silent) {
    const seen = e.searchResults;
    if (!seen) {
      unmeasured.push(e);
      continue;
    }
    const of = `${seen.answers} ${plural(seen.answers, "answer")}`;
    reasons.push(
      seen.withYourSite === 0
        ? `Your site didn't appear in ${e.name}'s search results in any of ${of}.`
        : `Your site was in ${e.name}'s search results in ${seen.withYourSite} of ${of}, and ${e.name} still didn't name you.`,
    );
  }
  if (reasons.length === 0) return { title };
  // 13 Nov follow-up (Sri): said plainly -- "Gemini didn't name you in any of 10 answers. We can see the pages it
  // cited, but not what it searched, so we can't say why."
  if (unmeasured.length > 0) {
    const one = unmeasured.length === 1;
    const n = unmeasured.reduce((s, e) => s + e.sampleCount, 0);
    const it = one ? "it" : "they";
    reasons.push(
      `${nameList(unmeasured.map((e) => e.name))} didn't name you in any of ${n} ${plural(n, "answer")}. We can see the pages ${it} cited, but not what ${it} searched, so we can't say why.`,
    );
  }
  return { title, detail: reasons.join(" ") };
}

function silentEngineFinding(data: FindingsData): Finding | null {
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
    recommendation: silentEngineRecommendation(silent),
  };
}

/** "Provider spend limit reached (a monthly limit ...)" -> "provider spend limit reached". */
function shortReason(reason: string | null): string {
  if (!reason) return "every call failed";
  const head = reason.split(" (")[0];
  return head.charAt(0).toLowerCase() + head.slice(1);
}

function failedEngineFinding(data: FindingsData): Finding | null {
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

function competitorFinding(data: FindingsData): Finding | null {
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

function redditFinding(data: FindingsData): Finding | null {
  const reddit = redditCited(data);
  if (!reddit) return null;
  return {
    rule: "f",
    kind: "watch",
    icon: "forum",
    title: "AI cites Reddit threads for these questions",
    explanation: `AI engines cited Reddit threads in ${reddit.cited} of ${reddit.total} answers to everyday questions about businesses like yours. Being named in the threads they read is one way into those answers.`,
    severity: MEDIUM,
    evidenceLabel: `Evidence · Audit #${data.basis.auditNumber} · ${reddit.total} everyday answers`,
    evidence: [
      [
        { text: "Reddit → ", tone: "plain" },
        { text: `cited in ${reddit.cited} of ${reddit.total} answers`, tone: "cmp" },
      ],
    ],
    fix: "Answer questions in the local Reddit threads where customers ask about your services, as your business, helpfully rather than as an ad",
    recommendation: {
      title: "Get mentioned in relevant Reddit threads",
      detail: `Reddit was cited in ${reddit.cited} of ${reddit.total} answers.`,
    },
  };
}

function strengthFinding(data: FindingsData): Finding | null {
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

/** Up to three problems (rules a, b, c, e, f, in that order) and one strength (d), problems first. */
export function reportFindings(data: FindingsData): Finding[] {
  const problems = [
    directoryFinding(data),
    silentEngineFinding(data),
    failedEngineFinding(data),
    competitorFinding(data),
    redditFinding(data),
  ]
    .filter((f): f is Finding => f !== null)
    .slice(0, 3);
  const strength = strengthFinding(data);
  return strength ? [...problems, strength] : problems;
}
