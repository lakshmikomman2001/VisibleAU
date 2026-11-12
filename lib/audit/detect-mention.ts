import { extractListRank } from "@/lib/audit/extract-list-rank";
import { brandNamePattern, domainStem, normalizeBrandName } from "@/lib/brands/normalize";
import { detectionText } from "./detection-text";

export interface MentionResult {
  found: boolean;
  /**
   * Vunnara (20 Oct, post-a093ceb): the real 1-based rank within a
   * numbered/bulleted list the mention sits in (see extractListRank),
   * never a count of capitalised words before the match -- that old
   * heuristic produced numbers with no relationship to how an engine's
   * answer was actually structured (audit #30: ranks 4/8 stored as
   * 33/53). `null` while `found` is true means "mentioned, but not
   * inside a list" (ordinary prose) -- a real, honest absence of rank,
   * not a missing measurement.
   */
  position: number | null;
  confidence: "high" | "medium" | "low";
  detectionMethod: "regex" | "entity" | "llm" | "none";
  /**
   * Vunnara (21 Oct, "audit reliability" Part B): the character offset
   * of the match, exposed so verifyMention can look at the surrounding
   * ±300 characters for a confirming location. Since part 4 (6 Nov) it's
   * an offset in detectionText(response), the copy both read.
   * `null` whenever `found` is false -- there is no match to anchor a
   * window on.
   */
  matchIndex: number | null;
}

/**
 * 13 Nov (audit #46): what an answer may put between any two letters of a name and still be writing that
 * name -- spaces and tabs (never a line break), hyphens and dashes, "&", apostrophes and full stops. The
 * brand stored as "herohomeservices" (the wizard took the domain label) scored 0 of 41 while ChatGPT listed
 * "**Hero Home Services** (Yennora-based)" first: the name was only ever matched with gaps where the STORED
 * name had spaces, and it had none.
 */
const GAP = "[ \\t\\-\\u2013\\u2014&'\\u2019.]*";
/** The name's own boundaries and possessive, as brandNamePattern has them. */
const BEFORE = "(?<![A-Za-z0-9])";
const AFTER = "(?:['\\u2019]s?)?(?![A-Za-z0-9])";
/** Shorter than this (letters and digits, gaps ignored), a spacing-free match is noise ("A B", "a.b"). */
const MIN_SPACING_FREE_LETTERS = 4;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const AND = "(?:a[ \\t\\-\\u2013\\u2014'\\u2019.]*n[ \\t\\-\\u2013\\u2014'\\u2019.]*d|&)";

/** A word as units to put one GAP between: each letter, or "and" (as "and" or "&") wherever it appears. */
function units(word: string): string[] {
  if (word === "&") return [AND];
  return word
    .split("and")
    .flatMap((part, i) => [...(i > 0 ? [AND] : []), ...[...part].map(escapeRegExp)]);
}

/**
 * One name, written with any spacing: case, spaces, hyphens, "&" for "and" (and back) and full stops don't
 * matter, so "herohomeservices", "Hero Home Services", "Hero-Home-Services" and "HERO HOME SERVICES" are all
 * the same name, whichever of them is stored. Still a whole name: a letter or digit right before or after it
 * ("SuperOmega Services", "Omega Serviceswhich") is another word, and a different word in the middle
 * ("Omega Plumbing Services") is a different name. `null` when the name has under four letters and digits.
 */
export function spacingFreeNamePattern(name: string): RegExp | null {
  const words =
    normalizeBrandName(name)
      .toLowerCase()
      .match(/[\p{L}\p{N}]+|&/gu) ?? [];
  const letters = words.join("").replace(/&/g, "and").length;
  if (letters < MIN_SPACING_FREE_LETTERS) return null;
  return new RegExp(`${BEFORE}${words.flatMap(units).join(GAP)}${AFTER}`, "i");
}

function firstMatch(text: string, pattern: RegExp | null): number | null {
  if (!pattern) return null;
  const copy = new RegExp(pattern.source, pattern.flags.replace("g", ""));
  const match = copy.exec(text);
  return match ? match.index : null;
}

function earliest(...indexes: Array<number | null>): number | null {
  const found = indexes.filter((i): i is number => i !== null);
  return found.length === 0 ? null : Math.min(...found);
}

function foundAt(
  text: string,
  index: number,
  method: "regex" | "entity",
  confidence: "high" | "medium",
): MentionResult {
  return {
    found: true,
    position: extractListRank(text, index),
    confidence,
    detectionMethod: method,
    matchIndex: index,
  };
}

/**
 * The one test of whether an answer names a business (13 Nov: the four engines, Google's AI Overviews and
 * AI Mode, and competitors all come here; lib/audit/answer-mention.ts adds the verification):
 * 1. its name: brandNamePattern (lib/brands/normalize.ts: the stored words with any of space, hyphen, dash,
 *    "&", apostrophe or full stop between them, "and" or "&", a possessive) or spacingFreeNamePattern (the
 *    same name with the spacing ignored); the earlier of the two in the answer;
 * 2. else its domain's name part ("herohomeservices" from herohomeservices.com.au, four or more letters),
 *    with the spacing ignored the same way, which also finds the domain written out.
 * Both read detectionText(response) ("**Hero** Home Services" reads as "Hero Home Services"); the stored
 * answer is never changed. A name match is only a NAME match: a short or shared name ("Omega") still has to
 * be verified as this business (lib/audit/verify-mention.ts) before it counts.
 */
export async function detectBrandMention(
  response: string,
  brand: { name: string; domain: string },
): Promise<MentionResult> {
  const text = detectionText(response);
  const nameAt = earliest(
    firstMatch(text, brandNamePattern(brand.name)),
    firstMatch(text, spacingFreeNamePattern(brand.name)),
  );
  if (nameAt !== null) return foundAt(text, nameAt, "regex", "high");
  const stem = domainStem(brand.domain);
  const domainAt =
    stem.length >= MIN_SPACING_FREE_LETTERS ? firstMatch(text, spacingFreeNamePattern(stem)) : null;
  if (domainAt !== null) return foundAt(text, domainAt, "entity", "medium");
  return {
    found: false,
    position: null,
    confidence: "high",
    detectionMethod: "none",
    matchIndex: null,
  };
}
