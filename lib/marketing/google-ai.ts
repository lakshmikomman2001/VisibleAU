/**
 * 16 Nov (Sri's decision): Google AI Overviews and AI Mode are on for every Growth, Agency and Agency Pro workspace
 * (Starter stays off), and the product says so -- only while it's true. This is the one wording of every claim about
 * Google's AI answers: the pricing cards and the comparison table (through lib/pricing/tiers.ts), the landing page,
 * the FAQ, the about page and the methodology.
 *
 * The facts come from PublicGoogleAi, which only lib/governance/google-surfaces.ts publicGoogleAi() makes, from the
 * settings an audit resolves (the env switch, the provider's credentials, the global settings, the plan rule), and a
 * public page gets it from components/domain/google-ai/load-google-ai-claim.ts at request time. When that's null --
 * the global setting off, the env switch off, no credentials -- nothing here is said anywhere.
 * tests/unit/google-surfaces/public-google-claims.test.ts holds the public pages to that.
 *
 * Client-safe: no database, no env (the pricing cards are a client component).
 */
import { TIER_ENGINES } from "@/lib/llm/tier-engines";

/** lib/governance/google-surfaces.ts GOOGLE_SURFACES, in display order. */
export type GoogleAiSurface = "google_ai_overviews" | "google_ai_mode";

export interface PublicGoogleAi {
  /** What an audit for a workspace on `fromPlan` or above (with no override) runs now; never empty. */
  surfaces: GoogleAiSurface[];
  /** The plan key Google starts at (lib/pricing/tiers.ts GOOGLE_AI_FROM_TIER). */
  fromTier: string;
  /** That plan's name ("Growth"). */
  fromPlan: string;
  /** The "count in headline" setting: Google's answers counted in the Visibility score (off by default). */
  countedInScore: boolean;
  /** The device Google's results are fetched for. */
  device: "desktop" | "mobile";
  /** The provider's queue: "standard" answers about 10 minutes after the four engines. */
  queueMode: "standard" | "priority" | "live";
}

const SURFACE_NAMES: Record<GoogleAiSurface, string> = {
  google_ai_overviews: "AI Overviews",
  google_ai_mode: "AI Mode",
};

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

/** "AI Overviews and AI Mode", "AI Overviews", "AI Mode". */
export function googleAiSurfacesText(surfaces: readonly GoogleAiSurface[]): string {
  return surfaces.map((s) => SURFACE_NAMES[s]).join(" and ");
}

/** The plan line (lib/pricing/tiers.ts): "Google AI Overviews and AI Mode, checked from your postcode". */
export function googleAiPlanLine(surfaces: readonly GoogleAiSurface[]): string {
  return `Google ${googleAiSurfacesText(surfaces)}, checked from your postcode`;
}

/** The refusal on a plan below `fromPlan`: "Google AI Overviews and AI Mode, checked from your postcode, are part of
 * the Growth plan and up". */
export function googleAiLockedMessage(googleAi: PublicGoogleAi): string {
  const verb = googleAi.surfaces.length > 1 ? "are" : "is";
  return `${googleAiPlanLine(googleAi.surfaces)}, ${verb} part of the ${googleAi.fromPlan} plan and up`;
}

/** "the four AI engines": the engines of the plan Google starts at (lib/llm/tier-engines.ts). */
function enginesText(googleAi: PublicGoogleAi): string {
  const n = (TIER_ENGINES[googleAi.fromTier] ?? []).length;
  return `the ${NUMBER_WORDS[n] ?? String(n)} AI engines`;
}

/** "not counted in your score" -- or, while the operator counts Google in the headline, that it is. */
export function googleAiScoreClause(googleAi: PublicGoogleAi): string {
  return googleAi.countedInScore ? "counted in your Visibility score" : "not counted in your score";
}

/** When Google's answers arrive: only the standard queue has been measured (about 10 minutes, 11-12 Nov). */
export function googleAiArrival(googleAi: PublicGoogleAi): string {
  return googleAi.queueMode === "standard"
    ? `about 10 minutes after ${enginesText(googleAi)}' answers`
    : `after ${enginesText(googleAi)}' answers`;
}

/** The landing page's and the about page's sentence. */
export function googleAiPublicSentence(googleAi: PublicGoogleAi): string {
  return `On ${googleAi.fromPlan} plans and up, we also check Google's ${googleAiSurfacesText(googleAi.surfaces)} from your postcode, shown alongside ${enginesText(googleAi)} (${googleAiScoreClause(googleAi)}).`;
}

/**
 * 19 Nov (Sri's review of /pricing): where Google's results are checked from -- lib/google-surfaces/location.ts's
 * order: the postcode if the provider's list of Google's places has it, else the suburb, the city, the state's
 * capital. One wording for the comparison table and the methodology.
 */
export const GOOGLE_AI_LOCATION_TEXT =
  "from your postcode where Google supports it, otherwise your suburb, city or state capital";

/**
 * 19 Nov: why a business with no fixed location isn't checked on Google -- the reason the audit shows it, word for word
 * (lib/google-surfaces/location.ts resolveGoogleLocation returns this; lib/audit/google-surfaces/reasons.ts shows it as
 * it is). Here so the methodology can quote it without loading the location list.
 */
export const GOOGLE_ONLINE_ONLY_REASON =
  "An online-only business has no suburb to locate Google results at.";

/** The comparison table's grey line under the Google row (19 Nov), like the lines under the rows below it. */
export function googleAiRowDescription(googleAi: PublicGoogleAi): string {
  const score = googleAi.countedInScore
    ? "Shown in its own section and counted in your Visibility score."
    : "Shown in its own section, not counted in your Visibility score.";
  return `${score} ${GOOGLE_AI_LOCATION_TEXT.charAt(0).toUpperCase()}${GOOGLE_AI_LOCATION_TEXT.slice(1)}.`;
}

/**
 * 19 Nov (the FAQ's "Is my data safe?"): what goes to DataForSEO -- each question as the search (lib/serp/dataforseo.ts
 * `keyword`) and the Google location it's checked from (`location_code`), nothing else about the business.
 */
export function googleAiDataSentence(googleAi: PublicGoogleAi): string {
  return `On ${googleAi.fromPlan} plans and up, the same questions also go to DataForSEO, which asks Google for us, logged out, with the place they're checked from (your postcode, or else your suburb, city or state capital).`;
}

/** 19 Nov (the FAQ's "How long does an audit take?"). */
export function googleAiTimingSentence(googleAi: PublicGoogleAi): string {
  return `On ${googleAi.fromPlan} plans and up, Google's results arrive ${googleAiArrival(googleAi)}.`;
}

/** The FAQ's question and answer. */
export function googleAiFaq(googleAi: PublicGoogleAi): { q: string; a: string } {
  const text = googleAiSurfacesText(googleAi.surfaces);
  const counted = googleAi.countedInScore
    ? "They're shown in their own section and counted in your Visibility score."
    : "They're shown in their own section and aren't counted in your Visibility score.";
  return {
    q: `Do you check Google's ${text}?`,
    a: `Yes, on ${googleAi.fromPlan} plans and up. Each audit asks Google the same questions, logged out, on ${googleAi.device}, from your postcode (without one, your suburb, city or state capital, labelled "not your suburb"). The results arrive ${googleAiArrival(googleAi)}. ${counted}`,
  };
}
