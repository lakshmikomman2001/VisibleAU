import { detectionText } from "@/lib/audit/detection-text";
import { isBrandDomain } from "@/lib/audit/extract-citations";

export type MentionVerification = "verified_domain" | "verified_location" | "unverified";

export interface VerifyMentionInput {
  matchIndex: number | null;
  responseText: string;
  /** The answer's stored sources (lib/audit/extract-citations.ts's mergeCitedSources). */
  citedSources: Array<{ domain: string; cited?: boolean }>;
  brand: {
    domain: string;
    suburb: string | null;
    city: string | null;
    state: string | null;
    locationConfirmedAt: Date | null;
    /** Reliability follow-up, item 1: an online_only brand has no
     * suburb by definition -- it must verify by domain only, never by
     * falling through to a location check that was never meaningful
     * for it in the first place. null is treated the same as
     * "fixed" (every brand written before this column existed). */
    locationMode: "fixed" | "online_only" | null;
  };
}

const LOCATION_WINDOW_CHARS = 300;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Audit reliability, Part B, item 1: a name match (lib/audit/detect-
 * mention.ts's detectBrandMention) only proves the brand's NAME showed
 * up -- audit #30 found a common name ("Omega Services") matching a
 * different, unrelated business. This is the one place that turns a
 * name match into a verified mention: either a cited source resolves
 * to the brand's own domain (isBrandDomain, which already handles
 * www./subdomains and rejects a competitor whose domain merely
 * contains the brand's as a substring), or the brand's confirmed
 * SUBURB, CITY (when it isn't NULL) or POSTCODE (if ever stored --
 * brands has no such column today, so this is honest about never
 * checking it rather than inventing one) appears as a whole word
 * within +/-300 characters of the match.
 *
 * Reliability follow-up, item 1 (honesty bug): `state` is deliberately
 * NEVER enough on its own to verify a LOCAL business -- in audit #30's
 * branded answers, Claude cited a Thornleigh NSW "Omega Services"
 * listing (a different business); checking state alone would have
 * verified it as this brand's real Norwest NSW listing, since both
 * sit in the same state. A state match is supporting evidence at
 * best, never load-bearing by itself, so it's excluded from this
 * check entirely rather than given a weight that would be guesswork.
 * Build 2's planned state-/country-level questions (for a brand whose
 * real reach IS that broad) will need their own, coarser verification
 * rule when they ship -- not this one, and not yet.
 *
 * Word-boundary matching (not a plain substring scan) still matters
 * for suburb/city: a short or common name could otherwise false-
 * positive inside unrelated prose the same way a state code used to
 * ("anSWer", "aWArd").
 *
 * An `online_only` brand has no suburb by definition (Build 1, Part D)
 * -- it verifies by domain only; the location check never runs for it
 * at all, so there's nothing for a coincidental text match to
 * incorrectly verify.
 *
 * Returns "unverified" (not thrown, not "found: false") when neither
 * check passes -- the mention is still real text the engine produced,
 * just not confirmed as THIS business, so lib/audit/organic-
 * citations.ts and lib/scoring/resolve-audit-dimensions.ts stop
 * counting it while the raw citation row is still kept and shown as
 * "Possible mention, not confirmed as your business".
 *
 * One resolver path: both lib/audit/run-audit-inline.ts and
 * inngest/functions/run-audit.ts call this same function; neither has
 * its own copy of the domain or location logic.
 *
 * "Mention detection" (6 Nov), part 5 -- the domain check means the same
 * thing on every engine: a source the ANSWER cited is the brand's own
 * domain. A Claude search result the answer didn't cite (cited: false) is
 * seen in search, never verification. A Gemini grounding link's real site
 * is now in its stored source ({ domain } from the grounding title), so
 * Gemini verifies from what's stored, cache hits included, instead of a
 * separate list that was never stored or cached.
 */
export function verifyMention(input: VerifyMentionInput): MentionVerification {
  const domainVerified = input.citedSources.some(
    (source) => source.cited !== false && isBrandDomain(source.domain, input.brand.domain),
  );
  if (domainVerified) return "verified_domain";

  const isOnlineOnly = input.brand.locationMode === "online_only";
  if (!isOnlineOnly && input.matchIndex !== null && input.brand.locationConfirmedAt) {
    // "Mention detection" (6 Nov), part 4: matchIndex is an offset in the normalised copy detection read
    // (lib/audit/detection-text.ts), so the window is cut from that same copy.
    const text = detectionText(input.responseText);
    const windowStart = Math.max(0, input.matchIndex - LOCATION_WINDOW_CHARS);
    const windowEnd = Math.min(text.length, input.matchIndex + LOCATION_WINDOW_CHARS);
    const window = text.slice(windowStart, windowEnd);

    // state is intentionally excluded -- see this function's own doc
    // comment. No postcode column exists on brands today, so there is
    // nothing to add for it yet either.
    const locationTerms = [input.brand.suburb, input.brand.city].filter(
      (term): term is string => typeof term === "string" && term.trim().length > 0,
    );
    const locationVerified = locationTerms.some((term) =>
      new RegExp(`\\b${escapeRegExp(term.trim())}\\b`, "i").test(window),
    );
    if (locationVerified) return "verified_location";
  }

  return "unverified";
}
