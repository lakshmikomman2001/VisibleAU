/**
 * S01 part 3 (LLD 8.1.5 rule h, appendix C1): an AI engine said it couldn't find the business. A phrase list, matched
 * case-insensitively in answers to questions that name the business; the sentence that contains the match is quoted
 * (at most QUOTE_MAX characters). No model judgement: the finding is only ever the engine's own words.
 *
 * Appendix C1's heading says "finding rule g"; the rule is h (LLD 8.1.5's table). Reported in the S01 report.
 */
export const COULD_NOT_FIND_PHRASES: readonly RegExp[] = [
  /unable to find any (verified )?information/i,
  /could not find any information/i,
  /couldn['’]t find any information/i,
  /no information available (online )?about/i,
  /I don['’]t have (any )?(specific )?information about/i,
  /there is no (publicly available )?information about/i,
  /I could not verify/i,
  /no results for a (company|business) (named|called)/i,
  /may be referring to/i,
  /did not return any listings/i,
];

export const QUOTE_MAX = 200;

/** The sentence around `index` in `text`: from the previous sentence end to the next one (., !, ? or a line break). */
function sentenceAround(text: string, start: number, end: number): string {
  let from = start;
  while (from > 0 && !/[.!?\n]/.test(text[from - 1] ?? "")) from -= 1;
  let to = end;
  while (to < text.length && !/[.!?\n]/.test(text[to] ?? "")) to += 1;
  if (to < text.length && /[.!?]/.test(text[to] ?? "")) to += 1;
  return text
    .slice(from, to)
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** At most QUOTE_MAX characters, cut at a word with "…" when longer, keeping the matched phrase. */
function fitQuote(sentence: string, phrase: string): string {
  if (sentence.length <= QUOTE_MAX) return sentence;
  const at = sentence.toLowerCase().indexOf(phrase.toLowerCase());
  let from = Math.max(0, Math.min(at, sentence.length - (QUOTE_MAX - 2)) - 20);
  if (from > 0) {
    const space = sentence.indexOf(" ", from);
    from = space === -1 ? from : space + 1;
  }
  let piece = sentence.slice(from, from + QUOTE_MAX - (from > 0 ? 2 : 1));
  const lastSpace = piece.lastIndexOf(" ");
  if (lastSpace > QUOTE_MAX / 2) piece = piece.slice(0, lastSpace);
  return `${from > 0 ? "…" : ""}${piece.trim()}…`;
}

/** The first "couldn't find" sentence in an answer, quoted, or null when the answer has none. */
export function couldNotFindQuote(answer: string | null | undefined): string | null {
  if (!answer) return null;
  for (const pattern of COULD_NOT_FIND_PHRASES) {
    const match = pattern.exec(answer);
    if (!match) continue;
    const sentence = sentenceAround(answer, match.index, match.index + match[0].length);
    return fitQuote(sentence, match[0]);
  }
  return null;
}
