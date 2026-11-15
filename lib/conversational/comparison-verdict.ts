/**
 * 17 Nov, part 3 -- how a head-to-head comparison answer is judged. Pure (no LLM, no database), so the runner
 * (lib/conversational/comparison-runner.ts, at write time) and the comparisons API (at read time, for rows the
 * old rule wrote) use the same rule.
 */

export interface ComparisonParties {
  brandName: string;
  brandDomain: string;
  competitorDomain: string;
}

export interface ComparisonVerdict {
  /** true: the answer's verdict favours the brand; false: the competitor; null: no verdict we can read. */
  brandWon: boolean | null;
  /** The answer's text contains the brand's name or website (a text match, not the audit's verified mention). */
  brandMentioned: boolean;
  /** The answer's text contains the competitor's website. */
  competitorMentioned: boolean;
}

/** How much of the answer a row written before 17 Nov kept (comparison_prompt_results.verdict_snippet). */
export const LEGACY_VERDICT_SNIPPET_CHARS = 300;

const VERDICT_WORD = /recommend|better|prefer|winner|superior/i;
const NAME_CHAR = /[a-z0-9]/;

/**
 * Where `name` first appears in `text` as a whole name, or -1: not inside a longer word or a different domain
 * ("abc.com.au" isn't named by "myabc.com.au" or "my-abc.com.au"; "www.abc.com.au" names it).
 */
function indexOfName(text: string, name: string): number {
  if (name.length === 0) return -1;
  let at = text.indexOf(name);
  while (at !== -1) {
    const before = at === 0 ? "" : text[at - 1];
    const after = text[at + name.length] ?? "";
    if (!NAME_CHAR.test(before) && before !== "-" && !NAME_CHAR.test(after)) return at;
    at = text.indexOf(name, at + 1);
  }
  return -1;
}

/** The earliest place any of `names` appears, or -1. */
function firstIndex(text: string, names: readonly string[]): number {
  let best = -1;
  for (const name of names) {
    const at = indexOfName(text, name);
    if (at !== -1 && (best === -1 || at < best)) best = at;
  }
  return best;
}

function normaliseDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/**
 * In a verdict sentence naming both parties, the one it prefers when the sentence says so in the plain
 * pattern: "A is better than B" (A before the verdict word, B after "than"), or "I'd recommend A over B".
 * Anything else ("compared with B, A is better") is no vote: we don't guess.
 */
function preferredInSentence(
  sentence: string,
  b: number,
  c: number,
): "brand" | "competitor" | null {
  const better = sentence.search(/\b(better|superior)\b/);
  if (better !== -1) {
    const than = sentence.indexOf(" than ", better);
    if (than !== -1) {
      if (b < better && c > than) return "brand";
      if (c < better && b > than) return "competitor";
    }
  }
  const recommend = sentence.search(/recommend|prefer/);
  if (recommend !== -1) {
    const over = sentence.indexOf(" over ", recommend);
    if (over !== -1) {
      if (recommend < b && b < over && c > over) return "brand";
      if (recommend < c && c < over && b > over) return "competitor";
    }
  }
  return null;
}

/**
 * Who an answer to "Compare {brand site} vs {competitor site}. Which is better ...?" says is better. Before
 * 17 Nov it was whoever the answer named FIRST, once any verdict word appeared anywhere; and the brand was
 * found by its name only, so a brand the answer named by its website alone was "position -1", always first, a
 * win by default. The question names the brand's site first, so an answer that just repeated the question's
 * order "won" too.
 *
 * Now the verdict is read from the answer's verdict sentences only (a sentence with recommend / better /
 * prefer / winner / superior), and the brand is found by its name or its website:
 * - a verdict sentence naming only the brand is a vote for it; only the competitor, a vote for them;
 * - one naming both counts only in the plain "A is better than B" / "recommend A over B" pattern;
 * - votes all one way decide it; none, or both ways, is inconclusive (null).
 * Naming a party without a verdict is never a win or a loss.
 */
export function judgeComparison(answer: string, parties: ComparisonParties): ComparisonVerdict {
  const text = answer.toLowerCase();
  const brandNames = [
    parties.brandName.trim().toLowerCase(),
    normaliseDomain(parties.brandDomain),
  ].filter((n) => n.length > 0);
  const competitorNames = [normaliseDomain(parties.competitorDomain)].filter((n) => n.length > 0);

  const brandMentioned = firstIndex(text, brandNames) !== -1;
  const competitorMentioned = firstIndex(text, competitorNames) !== -1;

  const votes = new Set<"brand" | "competitor">();
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (!VERDICT_WORD.test(sentence)) continue;
    const b = firstIndex(sentence, brandNames);
    const c = firstIndex(sentence, competitorNames);
    if (b !== -1 && c === -1) votes.add("brand");
    else if (c !== -1 && b === -1) votes.add("competitor");
    else if (b !== -1 && c !== -1) {
      const preferred = preferredInSentence(sentence, b, c);
      if (preferred) votes.add(preferred);
    }
  }

  const brandWon = votes.size !== 1 ? null : votes.has("brand");
  return { brandWon, brandMentioned, competitorMentioned };
}

export interface StoredComparison {
  /** comparison_prompt_results.verdict_snippet: the whole answer since 17 Nov, its first 300 characters before. */
  verdictSnippet: string | null;
  brandWon: boolean | null;
  brandMentioned: boolean;
  competitorMentioned: boolean;
}

export interface RejudgedComparison extends ComparisonVerdict {
  /** true when only the start of the answer was kept, so no verdict can be read from it. */
  answerCutOff: boolean;
}

/**
 * A stored comparison, judged again by judgeComparison. Rows written before 17 Nov were judged by the old rule
 * (a website-only match counted as a win) and kept only the answer's first LEGACY_VERDICT_SNIPPET_CHARS
 * characters:
 * - an answer kept whole (shorter than that, or any row since 17 Nov) is judged again from its text;
 * - an answer cut off at that length can't be: its verdict is usually past the cut. It's inconclusive, and its
 *   mention flags are the stored ones (the old runner matched the name or website on the whole answer);
 * - a row with no text at all keeps what was stored (no runner writes one).
 */
export function rejudgeStoredComparison(
  row: StoredComparison,
  parties: ComparisonParties,
): RejudgedComparison {
  if (row.verdictSnippet === null) {
    return {
      brandWon: row.brandWon,
      brandMentioned: row.brandMentioned,
      competitorMentioned: row.competitorMentioned,
      answerCutOff: false,
    };
  }
  if (row.verdictSnippet.length === LEGACY_VERDICT_SNIPPET_CHARS) {
    return {
      brandWon: null,
      brandMentioned: row.brandMentioned,
      competitorMentioned: row.competitorMentioned,
      answerCutOff: true,
    };
  }
  return { ...judgeComparison(row.verdictSnippet, parties), answerCutOff: false };
}
