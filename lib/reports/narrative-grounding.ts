/**
 * DEMO-BLOCKER (1 Nov), part 3 -- the report's prose may only state what
 * was measured. Every sentence is checked against the report's allowed
 * facts; a sentence that fails is dropped (never repaired), and the drop
 * is logged as counts only -- never the sentence, which can carry a brand
 * or question text.
 *
 * Today no LLM writes the report: the paragraphs are sentence templates
 * chosen by rules (lib/reports/report-narrative.ts). This check runs on
 * them anyway, so a template edit, or a future LLM polish of the wording,
 * can't print an invented number, an engine the audit didn't ask, or a
 * verdict no rule computed.
 */

export type NarrativeClaim = "trend_rise" | "trend_fall";

export interface AllowedFacts {
  /** Bare numbers, as digits: "7", "40", "6" (from "1 in 6"). */
  numbers: Set<string>;
  /** Percentages, as printed: "18%". */
  percents: Set<string>;
  /** List ranks: 1 for "#1" or "first". */
  ranks: Set<number>;
  /** Audit numbers: 39 for "Audit #39". */
  auditNumbers: Set<number>;
  /** Engine display names the audit asked: "ChatGPT". */
  engines: Set<string>;
  /** Verdicts a computed rule allows. */
  claims: Set<NarrativeClaim>;
  /** Names the report prints as they are (the brand, competitors,
   * directories): ignored by every check, so "Best Electrical 24/7"
   * isn't read as a superlative and two numbers. */
  names: string[];
}

const KNOWN_ENGINES =
  /\b(ChatGPT|OpenAI|GPT-\d\w*|Claude|Gemini|Perplexity|Copilot|Grok|Bing|Meta AI|Llama|Mistral|DeepSeek)\b/g;

const NUMBER_WORDS: Record<string, string> = {
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
};
const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
};

/** Never printed: no rule computes these. */
const BANNED =
  /\b(authority|authoritative|leader|leading|dominant|dominat\w*|best|top-rated|number one|outperform\w*|guarantee\w*|projected|projection|forecast\w*|skyrocket\w*|surg\w*|archetype|quadrant)\b/i;
/** Only with a computed trend verdict. */
const TREND_WORDS = /\b(trend|trends|trending|trended)\b/i;
const RISE_WORDS = /\b(rose|risen|increased|improved|grew|growing)\b/i;
const FALL_WORDS = /\b(fell|fallen|decreased|declined|dropped)\b/i;

export type DropReason =
  | "number"
  | "percent"
  | "rank"
  | "audit_number"
  | "engine"
  | "banned_word"
  | "trend_claim";

/** Why `sentence` can't be printed, or null when every fact in it is allowed. */
export function sentenceProblem(text: string, facts: AllowedFacts): DropReason | null {
  // **emphasis** markers are layout, not content.
  let sentence = text.replace(/\*\*/g, "");
  for (const name of [...facts.names].sort((a, b) => b.length - a.length)) {
    if (name) sentence = sentence.split(name).join(" ");
  }
  if (BANNED.test(sentence)) return "banned_word";
  const hasTrendClaim = facts.claims.has("trend_rise") || facts.claims.has("trend_fall");
  if (TREND_WORDS.test(sentence) && !hasTrendClaim) return "trend_claim";
  if (RISE_WORDS.test(sentence) && !facts.claims.has("trend_rise")) return "trend_claim";
  if (FALL_WORDS.test(sentence) && !facts.claims.has("trend_fall")) return "trend_claim";

  for (const m of sentence.matchAll(KNOWN_ENGINES)) {
    if (!facts.engines.has(m[1])) return "engine";
  }

  // The interval's own name isn't a measured figure.
  let rest = sentence.replace(/95% (CI|confidence)/g, " ");

  for (const m of rest.matchAll(/\bAudits? #(\d+)(?:(?:[–-]| to )#?(\d+))?/g)) {
    for (const n of [m[1], m[2]]) {
      if (n !== undefined && !facts.auditNumbers.has(Number(n))) return "audit_number";
    }
  }
  rest = rest.replace(/\bAudits? #\d+(?:(?:[–-]| to )#?\d+)?/g, " ");

  for (const m of rest.matchAll(/#(\d+)(?:[–-](\d+))?/g)) {
    for (const n of [m[1], m[2]]) {
      if (n !== undefined && !facts.ranks.has(Number(n))) return "rank";
    }
  }
  rest = rest.replace(/#\d+(?:[–-]\d+)?/g, " ");

  for (const m of rest.matchAll(/(\d+(?:\.\d+)?)%/g)) {
    if (!facts.percents.has(`${m[1]}%`)) return "percent";
  }
  rest = rest.replace(/\d+(?:\.\d+)?%/g, " ");

  for (const m of rest.matchAll(/\d+(?:\.\d+)?/g)) {
    if (!facts.numbers.has(m[0])) return "number";
  }
  for (const m of rest.toLowerCase().matchAll(/\b[a-z]+\b/g)) {
    const digits = NUMBER_WORDS[m[0]];
    if (digits !== undefined && !facts.numbers.has(digits)) return "number";
    const rank = ORDINALS[m[0]];
    if (rank !== undefined && !facts.ranks.has(rank)) return "rank";
  }
  return null;
}

/** "Omega comes up in 5 of 30. When it does..." -> two sentences. */
export function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+(?=[A-Z(*])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface GroundedNarrative {
  paragraphs: string[];
  kept: number;
  dropped: number;
  reasons: Partial<Record<DropReason, number>>;
}

/**
 * Keeps each sentence whose every number, percentage, rank, audit number,
 * engine and verdict is in `facts`; drops the rest. A paragraph left
 * empty is dropped too. Logs the counts when anything was dropped.
 */
export function groundNarrative(
  paragraphs: readonly string[],
  facts: AllowedFacts,
  log: (line: string) => void = (line) => console.warn(line),
): GroundedNarrative {
  let kept = 0;
  let dropped = 0;
  const reasons: Partial<Record<DropReason, number>> = {};
  const out: string[] = [];
  for (const paragraph of paragraphs) {
    const sentences = splitSentences(paragraph).filter((sentence) => {
      const problem = sentenceProblem(sentence, facts);
      if (problem === null) {
        kept++;
        return true;
      }
      dropped++;
      reasons[problem] = (reasons[problem] ?? 0) + 1;
      return false;
    });
    if (sentences.length > 0) out.push(sentences.join(" "));
  }
  if (dropped > 0) {
    log(JSON.stringify({ event: "report_narrative_sentences_dropped", kept, dropped, reasons }));
  }
  return { paragraphs: out, kept, dropped, reasons };
}
