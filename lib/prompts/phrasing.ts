/**
 * S00 part 3 (22 Nov; LLD 8.8.1, T3): how a service is written inside a question. NumbaTek IT's audit #52 asked
 * "Best managed it services in …?" and "Is NumbaTek IT a good choice for a managed it services in …?": the
 * classifier's words are stored lower-case (lib/brands/service-phrase.ts sanitizeServicePhrase), so the acronym lost
 * its capitals, and "a" was put before a plural.
 *
 * - toServicePhrase(label): the acronyms below in their own casing ("managed it services" -> "managed IT services").
 * - withArticle(phrase): "a"/"an" by sound ("an IT consultant", "an SEO agency", "a CCTV installer"), and none before
 *   a plural or uncountable service ("managed IT services", "dog grooming", "IT support").
 * - lowerCaseAcronymProblem / articleBeforePluralProblem: the two checks lib/prompts/validate-question.ts adds.
 *
 * Questions already stored in a brand's pack are never rewritten (N1): these apply to questions written from now on.
 */

/** The maintained acronym list (LLD 8.8.1), in the casing a question uses. */
export const ACRONYMS = [
  "IT",
  "AC",
  "HVAC",
  "CCTV",
  "NDIS",
  "SEO",
  "AEO",
  "GEO",
  "CPA",
  "GP",
  "MRI",
  "EV",
  "VoIP",
  "Wi-Fi",
  "SaaS",
  "CRM",
  "ERP",
  "HR",
  "BAS",
  "SMSF",
  "WHS",
  "IVF",
  "ENT",
] as const;

/** Said as a word, not letter by letter: its article follows its first sound ("a SaaS platform", "a VoIP system"). */
const SAID_AS_A_WORD: ReadonlySet<string> = new Set(["VoIP", "Wi-Fi", "SaaS"]);

/** Letters whose name starts with a vowel sound: "an HR", "an SEO", "an MRI", "an NDIS". */
const VOWEL_SOUND_LETTERS = new Set([..."AEFHILMNORSX"]);

const BY_LOWER = new Map<string, string>(ACRONYMS.map((a) => [a.toLowerCase(), a]));

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A whole token: not inside a longer word (letters, digits, hyphens and apostrophes count as the word). */
const WORD_BOUNDARY_BEFORE = "(?<![\\p{L}\\p{N}'’-])";
const WORD_BOUNDARY_AFTER = "(?![\\p{L}\\p{N}'’-])";

const ACRONYM_TOKEN = new RegExp(
  `${WORD_BOUNDARY_BEFORE}(${[...BY_LOWER.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")})${WORD_BOUNDARY_AFTER}`,
  "giu",
);

/**
 * A service label with the listed acronyms in their own casing; everything else as it was. Inside a service label
 * "it" is always the acronym ("it support", "managed it services"); in a whole question it can be the pronoun, which
 * is why the question check (lowerCaseAcronymProblem) looks at IT's neighbours and this doesn't.
 */
export function toServicePhrase(label: string): string {
  return label.replace(ACRONYM_TOKEN, (token) => BY_LOWER.get(token.toLowerCase()) ?? token);
}

/** Function words that end a noun phrase: the service before them is the phrase whose head decides the article. */
const PHRASE_ENDS = new Set(
  (
    "for in of with to near around and or who that which on at from by than vs versus open available " +
    "is are was were can could do does should will would has have offering offers"
  ).split(" "),
);

/** Services that take no article (a/an): "a good choice for dog grooming", "for IT support". */
const UNCOUNTABLE_HEADS = new Set(
  (
    "support maintenance advice software equipment insurance care control therapy management security " +
    "training tuition finance hire repair help work"
  ).split(" "),
);

/** Ends in -s but isn't a plural. */
const NOT_PLURAL = new Set(
  "gas lens news series species means bus plus atlas canvas alias chassis corps physics ethics bas".split(
    " ",
  ),
);

/** Whether `word` (a phrase's head) is a plural noun: "services", "repairs", "GPs"; not "business", "gas". */
export function isPluralHead(word: string): boolean {
  const w = word.replace(/['’]s$/, "");
  if (BY_LOWER.has(w.toLowerCase())) return false;
  const lower = w.toLowerCase();
  if (lower.length < 3 || !lower.endsWith("s")) return false;
  if (NOT_PLURAL.has(lower)) return false;
  return !/(ss|us|is|ous)$/.test(lower);
}

function isUncountableHead(word: string): boolean {
  const lower = word.toLowerCase();
  return UNCOUNTABLE_HEADS.has(lower) || (lower.length > 4 && lower.endsWith("ing"));
}

/** The article an acronym or a word takes by its first sound. */
function articleFor(firstWord: string): "a" | "an" {
  const acronym = BY_LOWER.get(firstWord.toLowerCase());
  if (acronym && firstWord === acronym) {
    if (SAID_AS_A_WORD.has(acronym)) return /^[aeiou]/i.test(acronym) ? "an" : "a";
    return VOWEL_SOUND_LETTERS.has(acronym[0]) ? "an" : "a";
  }
  // Every other word: the existing rule (lib/brands/service-phrase.ts withIndefiniteArticle).
  return /^[aeiou]/i.test(firstWord) ? "an" : "a";
}

/**
 * "a"/"an" + the phrase, or the phrase alone when it's plural or uncountable: "an IT consultant", "a dog groomer",
 * "managed IT services", "dog grooming", "IT support". The phrase is a short service label (lib/brands/service-
 * phrase.ts keeps at most five words); its last word is its head.
 */
export function withArticle(phrase: string): string {
  const trimmed = phrase.trim().replace(/\s+/g, " ");
  const words = trimmed.split(" ");
  const head = words[words.length - 1] ?? "";
  if (isPluralHead(head) || isUncountableHead(head)) return trimmed;
  return `${articleFor(words[0] ?? "")} ${trimmed}`;
}

/**
 * IT only where it's the acronym: next to a word that only an IT service has, and not after a verb that makes "it"
 * the pronoun ("does it support Xero?"). "Is it worth it?" stays fine.
 */
const LOWER_CASE_IT = new RegExp(
  `${WORD_BOUNDARY_BEFORE}(?:managed\\s+it|(?<!\\b(?:does|do|did|will|would|can|could|should|is|was|has|make|makes|let|lets)\\s+)` +
    `[Ii]t\\s+(?:services?|support|solutions?|company|companies|providers?|consultants?|consultancy|helpdesk|` +
    `help\\s+desk|repairs?|specialists?|technicians?|department|infrastructure|managed\\s+services?|outsourcing|` +
    `contractors?|firms?))${WORD_BOUNDARY_AFTER}`,
  "giu",
);

/**
 * The first listed acronym the question writes in lower case ("seo", "Seo" at the start, "hvac", "voip"), or null.
 * IT only in an IT-service context ("managed it services", "it support"), never the pronoun.
 */
export function lowerCaseAcronymProblem(text: string): string | null {
  // The pattern ignores case, so "Managed it" and "It support" are caught; "IT support" itself is fine.
  for (const it of text.matchAll(LOWER_CASE_IT)) if (!/\bIT\b/.test(it[0])) return it[0];
  for (const match of text.matchAll(ACRONYM_TOKEN)) {
    const token = match[0];
    const acronym = BY_LOWER.get(token.toLowerCase());
    if (!acronym || token === acronym || acronym === "IT") continue;
    // A word that is also an acronym in lower case ("ent", "geo", "bas", "ac", "ev", "gp" have no English use in
    // these questions); "It"/"it" is handled above.
    return token;
  }
  return null;
}

/**
 * "a"/"an" before a plural noun phrase ("a managed IT services"), or null. The phrase after the article runs to the
 * next function word ("for", "in", "who"…) or punctuation, up to four words; only a phrase ended that way is judged,
 * and its last word is its head.
 */
export function articleBeforePluralProblem(text: string): string | null {
  const words = text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const article = words[i].toLowerCase();
    if (article !== "a" && article !== "an") continue;
    const phrase: string[] = [];
    let ended = false;
    for (let j = i + 1; j < words.length && phrase.length <= MAX_PHRASE_WORDS; j++) {
      const raw = words[j];
      const bare = raw.replace(/[?!.,;:)"”]+$/, "");
      if (PHRASE_ENDS.has(bare.toLowerCase())) {
        ended = true;
        break;
      }
      phrase.push(bare);
      if (bare !== raw || j === words.length - 1) {
        ended = true;
        break;
      }
    }
    if (!ended || phrase.length === 0 || phrase.length > MAX_PHRASE_WORDS) continue;
    // "a few quotes", "a dozen eggs": a quantity before a plural is right.
    if (QUANTITIES.has(phrase[0].toLowerCase())) continue;
    const head = phrase[phrase.length - 1];
    if (isPluralHead(head)) return `${words[i]} ${phrase.join(" ")}`;
  }
  return null;
}

const MAX_PHRASE_WORDS = 4;
const QUANTITIES = new Set("few dozen hundred thousand million couple".split(" "));
