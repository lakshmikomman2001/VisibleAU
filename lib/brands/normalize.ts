/**
 * Vunnara Build 1, Part A: the one shared brand-name normalisation and
 * free-text-matching contract. Used at WRITE time (brand create/update,
 * sample audits) so a stored name is never " Omega Services" with a
 * leading space or doubled internal whitespace, and at MATCH time
 * (mention detection, the branded-prompt rule) so the same name matches
 * however an LLM or a prod-fix happens to format it -- quoted, **bold**,
 * a trailing possessive, hyphenated, etc.
 */

const WHITESPACE_RE = /\s+/g;

/** trim + Unicode NFKC + collapse internal whitespace to single spaces. */
export function normalizeBrandName(raw: string): string {
  return raw.normalize("NFKC").trim().replace(WHITESPACE_RE, " ");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A case-insensitive RegExp matching `name` inside free text.
 *
 * - Separators BETWEEN words tolerate the punctuation a formatter or an
 *   LLM answer might insert in place of a plain space: whitespace,
 *   hyphen, en dash, em dash, ampersand, straight/curly apostrophe,
 *   period. Zero or more of these between each pair of words, so
 *   "Omega-Services", "Omega & Services" and "OmegaServices" all match
 *   the two-word name "Omega Services".
 * - Boundaries are "not a letter or digit" lookarounds, not `\b` --
 *   `\b` treats an adjacent quote/apostrophe inconsistently, where a
 *   lookaround on the actual character class doesn't. This is what
 *   makes `"Omega Services"`, `**Omega Services**` and
 *   `_Omega Services_` all match: the quote/asterisk/underscore is
 *   "not a letter or digit", so it satisfies the boundary.
 * - An optional trailing possessive is allowed: a straight or curly
 *   apostrophe, optionally followed by "s" -- covers "Omega's",
 *   "Omega’s", and (since the "s" is optional) "Services'" where the
 *   name's own last word already ends in "s".
 * - Every word is escaped before being joined, so a name containing
 *   regex metacharacters (e.g. "A+ Plumbing") matches literally.
 */
export function brandNamePattern(name: string): RegExp {
  const normalized = normalizeBrandName(name);
  const words = normalized
    .split(" ")
    .filter(Boolean)
    // "and" as a whole word matches either the literal word or "&" --
    // the two are interchangeable in real brand names ("Smith and Jones"
    // vs "Smith & Jones"), not just a formatting variant the separator
    // class alone would catch (the separator only joins ADJACENT words;
    // "and" is its own word here, not a joiner).
    .map((w) => (w.toLowerCase() === "and" ? "(?:and|&)" : escapeRegExp(w)));
  const SEPARATOR = "[\\s\\-\\u2013\\u2014&'\\u2019.]*";
  const body = words.join(SEPARATOR);
  const pattern = `(?<![A-Za-z0-9])${body}(?:['\\u2019]s?)?(?![A-Za-z0-9])`;
  return new RegExp(pattern, "gi");
}

/**
 * The significant part of a domain for loose entity matching -- strips
 * a trailing public-suffix-style TLD and all non-letters/digits, e.g.
 * "omega-services.com.au" -> "omegaservices". Callers should ignore
 * stems under 4 characters (too likely to false-positive on common
 * words / short generic domains) -- that threshold is a call-site
 * decision, not encoded here.
 */
export function domainStem(domain: string): string {
  const withoutTld = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.(com\.au|net\.au|org\.au|com|net|org|io|co)+$/i, "");
  return withoutTld.replace(/[^a-z0-9]/gi, "").toLowerCase();
}
