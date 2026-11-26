import { detectionText } from "@/lib/audit/detection-text";
import { isBrandedPrompt } from "@/lib/audit/flag-branded-prompts";
import { brandNamePattern } from "@/lib/brands/normalize";
import { questionTextKey } from "@/lib/questions/hash";

/**
 * S03 part 2 (LLD 8.3.2, appendix C2; contract P03.checks): the checks on a question someone writes, in one place for
 * the add drawer (as the user types) and the server (POST /api/brands/:id/questions/validate, and apply, which runs
 * them again on everything it's sent). Pure: the caller passes what the brand already has.
 *
 * Always shown, pass or fail: one question of 10-200 characters; not already in the brand's questions (compared as
 * question_text_key); whether it names the business (then it's shown but not scored -- a warning, not a failure); no
 * links, emails or phone numbers. Shown only when they apply: no place in the question (a warning, with a one-click
 * fix, never for Worldwide); a sixth question naming the business (a failure: at most 5, D-QI-BR); an instruction to
 * the AI rather than a customer's question (a failure, appendix C2); a competitor named (a warning: it's a comparison
 * question, still everyday unless it names the business too). Any failure blocks.
 *
 * Text is read as lib/audit/detection-text.ts reads an answer -- full-width letters folded, invisible characters and
 * soft hyphens removed, hyphen variants made "-" -- so a phrase can't slip past a check by being written oddly.
 */

export const QUESTION_MIN_LENGTH = 10;
export const QUESTION_MAX_LENGTH = 200;

export type QuestionReach = "local" | "state" | "country" | "global";
export type QuestionCheckId =
  | "shape"
  | "duplicate"
  | "names_business"
  | "contact"
  | "place"
  | "branded_limit"
  | "instruction"
  | "competitor";
export type QuestionCheckStatus = "pass" | "warn" | "fail";

export interface QuestionCheck {
  id: QuestionCheckId;
  status: QuestionCheckStatus;
  message: string;
  /** The place check's one-click fix: the button's label and the question it makes. */
  fix?: { label: string; text: string };
}

export interface QuestionValidation {
  /** No check failed. */
  ok: boolean;
  kind: "everyday" | "branded";
  /** The question as it would be stored: trimmed, inner whitespace runs as one space. */
  text: string;
  checks: QuestionCheck[];
}

export interface QuestionValidationContext {
  brand: { name: string; domain: string; aliases?: readonly string[] };
  /** question_text_key of every question the brand already has that this one mustn't repeat. */
  existingKeys: ReadonlySet<string>;
  /** How many questions that name the business the set already holds, not counting this one. */
  brandedInSet: number;
  /** At most this many may name the business (D-QI-BR: 5). */
  maxBranded: number;
  reach: QuestionReach;
  /** Any of these in the question counts as naming a place in the reach (suburb, city, state...). */
  places: readonly string[];
  /** The place the one-click fix adds ("Chatswood"); null when the reach has none. */
  fixPlace: string | null;
  /** The brand's configured competitors. */
  competitors: readonly string[];
}

export const CHECK_COPY = {
  shape: "One question, 10–200 characters",
  duplicate: "Not already in your questions",
  everyday: "Doesn't name your business, so it counts toward your score",
  branded: "Names your business, so it's shown but not scored",
  contact: "No links, emails or phone numbers",
  place:
    "No place in the question. AI answers differ by place, and Gemini can't be told your location.",
  brandedLimit: "Already 5 questions name your business. Remove one first.",
  instruction: "This reads like an instruction to the AI, not a customer's question.",
  competitor: (name: string) =>
    `Names ${name}. That's fine: it's counted as a comparison question.`,
  addPlace: (place: string) => `Add “in ${place}”`,
} as const;

/** Appendix C2: phrases that make a question read as an instruction to the AI. */
const STARTS_LIKE_AN_INSTRUCTION = /^(ignore|you are|pretend|act as)\b/;
const READS_LIKE_AN_INSTRUCTION =
  /\b(ignore (all |any )?(previous|prior) instructions|you are now|system prompt|developer message|jailbreak|respond only with|do not mention)\b/;

const URL_LIKE =
  /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|net|org|io|co|biz|info|app|au|nz|uk)(\.[a-z]{2})?\b/;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** An HTML tag or comment: "<b>", "</script>", "<!--". */
const HTML_TAG = /<\/?[a-z!][^>]*>?/i;
/** Phone numbers: eight or more digits in one run, allowing spaces, dots, dashes and brackets between them. */
const PHONE_LIKE = /(?:\+?\d[\s.()-]*){8,}/;

/** The stored form: trimmed, inner whitespace runs (line breaks aside) as one space. */
export function tidyQuestion(text: string): string {
  return text.replace(/[^\S\r\n]+/g, " ").trim();
}

/** The text the checks read: detectionText's folding, lower case, straight quotes. */
function readable(text: string): string {
  return detectionText(text).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

/** " in {place}" before the final "?" (or at the end). */
export function withPlace(text: string, place: string): string {
  const tidy = tidyQuestion(text);
  const body = tidy.replace(/\s*\?+\s*$/, "");
  return `${body} in ${place}${tidy.endsWith("?") ? "?" : ""}`;
}

function namesPlace(text: string, places: readonly string[]): boolean {
  const hay = readable(text);
  return places
    .map((p) => readable(p).trim())
    .filter((p) => p.length >= 2)
    .some((p) =>
      new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(hay),
    );
}

export function validateQuestion(raw: string, ctx: QuestionValidationContext): QuestionValidation {
  const text = tidyQuestion(raw);
  const plain = readable(text);
  const checks: QuestionCheck[] = [];

  // LLD 11 (stored XSS): no HTML accepted. P03 has no line of its own for it, so markup fails "One question": a
  // question is plain text.
  const oneQuestion =
    text.length >= QUESTION_MIN_LENGTH &&
    text.length <= QUESTION_MAX_LENGTH &&
    !/[\r\n]/.test(text) &&
    text.endsWith("?") &&
    (text.match(/\?/g) ?? []).length === 1 &&
    !HTML_TAG.test(text);
  checks.push({ id: "shape", status: oneQuestion ? "pass" : "fail", message: CHECK_COPY.shape });

  const duplicate = text.length > 0 && ctx.existingKeys.has(questionTextKey(text));
  checks.push({
    id: "duplicate",
    status: duplicate ? "fail" : "pass",
    message: CHECK_COPY.duplicate,
  });

  const branded =
    isBrandedPrompt(text, ctx.brand) || isBrandedPrompt(detectionText(text), ctx.brand);
  checks.push({
    id: "names_business",
    status: branded ? "warn" : "pass",
    message: branded ? CHECK_COPY.branded : CHECK_COPY.everyday,
  });

  const contact = URL_LIKE.test(plain) || EMAIL_LIKE.test(plain) || PHONE_LIKE.test(plain);
  checks.push({ id: "contact", status: contact ? "fail" : "pass", message: CHECK_COPY.contact });

  if (ctx.reach !== "global" && ctx.fixPlace && !namesPlace(text, ctx.places)) {
    checks.push({
      id: "place",
      status: "warn",
      message: CHECK_COPY.place,
      fix: { label: CHECK_COPY.addPlace(ctx.fixPlace), text: withPlace(text, ctx.fixPlace) },
    });
  }

  if (branded && ctx.brandedInSet >= ctx.maxBranded) {
    checks.push({ id: "branded_limit", status: "fail", message: CHECK_COPY.brandedLimit });
  }

  if (STARTS_LIKE_AN_INSTRUCTION.test(plain) || READS_LIKE_AN_INSTRUCTION.test(plain)) {
    checks.push({ id: "instruction", status: "fail", message: CHECK_COPY.instruction });
  }

  const competitor = ctx.competitors.find(
    (c) => c.trim().length > 0 && brandNamePattern(c).test(detectionText(text)),
  );
  if (competitor) {
    checks.push({ id: "competitor", status: "warn", message: CHECK_COPY.competitor(competitor) });
  }

  return {
    ok: checks.every((c) => c.status !== "fail"),
    kind: branded ? "branded" : "everyday",
    text,
    checks,
  };
}
