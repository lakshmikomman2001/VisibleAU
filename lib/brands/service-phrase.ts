/**
 * 16 Nov, part 1 -- the classifier's own words for what a business is ("dog groomer", "bike shop"), which the local
 * types' questions name: "Best dog groomer in Parramatta?". Only a short, plain phrase is kept -- anything else
 * (a sentence, a place, digits, a URL) is dropped, and the questions fall back to the type's own word.
 */
const MAX_LENGTH = 40;
const MAX_WORDS = 5;

export function sanitizeServicePhrase(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^(a|an|the)\s+/, "")
    .replace(/\s+near me$/, "")
    .replace(/[.!?,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > MAX_LENGTH) return undefined;
  if (cleaned.split(" ").length > MAX_WORDS) return undefined;
  // Letters (accented too: "café"), spaces, hyphens, apostrophes and ampersands -- no digits, URLs or symbols.
  if (!/^[\p{L}][\p{L} '&-]*$/u.test(cleaned)) return undefined;
  return cleaned;
}

/** "a dog groomer", "an accountant", "a café". */
export function withIndefiniteArticle(phrase: string): string {
  return `${/^[aeiou]/i.test(phrase) ? "an" : "a"} ${phrase}`;
}
