/**
 * Vunnara hotfix 2 (19 Oct, post-609e323): render-time validation over
 * every generated audit question. The bug this exists for: Omega
 * Services' pack had "Best emergency plumber Norwest in Norwest, NSW?"
 * -- classification.intentSignals entries ("emergency plumber Norwest")
 * already carry a place name, and buildEnrichedPrompts appended the
 * region again on top, naming the place twice. A doubled place name,
 * doubled whitespace, or doubled punctuation all mean the same thing:
 * two independent pieces of text collided without either one knowing
 * about the other -- never something a single well-formed template
 * produces on its own.
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The actual fix for the duplicate-place bug: classification.
 * intentSignals entries come from an LLM crawl and may already carry
 * a place name ("emergency plumber Norwest"). Strips it out BEFORE a
 * template appends its own region reference, so "Best {signal} in
 * {region}?" names the place once, naturally -- never relies on the
 * validator below to catch it after the fact; that's only a backstop.
 */
export function stripPlaceToken(text: string, region: string): string {
  const placeToken = region.split(",")[0]?.trim();
  if (!placeToken) return text;
  return text
    .replace(new RegExp(`\\b${escapeRegExp(placeToken)}\\b`, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface QuestionValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * `region` is whatever resolveRegionLabel produced -- "Norwest, NSW"
 * (no curated city), "Bondi" (curated city, suburb alone), or
 * "Australia" (no location at all). Only the first comma segment is
 * checked -- the actual PLACE name, not the state abbreviation that
 * legitimately appears once as part of the region label itself and
 * would never appear a second time on its own.
 *
 * `requireLocation` (default true) also rejects a question that's
 * missing the location entirely. Pass false for a template that
 * deliberately replaces the location with different audience-
 * appropriate phrasing instead ("...for Australian businesses?", never
 * naming the specific suburb at all by design) -- that's not a bug,
 * so it must not fail the "must contain the location" check meant for
 * templates that DO carry a {region} placeholder.
 */
export function validateGeneratedQuestion(
  text: string,
  region: string,
  requireLocation = true,
): QuestionValidationResult {
  if (/\s{2,}/.test(text)) {
    return { valid: false, reason: "doubled whitespace" };
  }
  if (/[?.!,]{2,}/.test(text)) {
    return { valid: false, reason: "doubled punctuation" };
  }

  const placeToken = region.split(",")[0]?.trim();
  if (placeToken) {
    const matches = text.match(new RegExp(`\\b${escapeRegExp(placeToken)}\\b`, "gi"));
    const count = matches?.length ?? 0;
    if (count > 1) {
      return { valid: false, reason: `place name "${placeToken}" appears ${count} times` };
    }
    if (count === 0 && requireLocation) {
      return { valid: false, reason: `missing the location ("${placeToken}")` };
    }
  }

  return { valid: true };
}
