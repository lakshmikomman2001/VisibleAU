import { isBrandDomain } from "@/lib/audit/extract-citations";

export type MentionVerification = "verified_domain" | "verified_location" | "unverified";

export interface VerifyMentionInput {
  matchIndex: number | null;
  responseText: string;
  citedSources: Array<{ domain: string }>;
  brand: {
    domain: string;
    suburb: string | null;
    city: string | null;
    state: string | null;
    locationConfirmedAt: Date | null;
  };
  /**
   * Audit reliability, Part B, item 2: real domains recovered from
   * Gemini's grounding metadata title, when its citation URL is the
   * opaque vertexaisearch.cloud.google.com redirect (see
   * lib/llm/web-search-config.ts's extractGroundingDomains and
   * CompleteOutput.groundingDomains). Absent for every other engine.
   */
  resolvedGroundingDomains?: string[];
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
 * name match into a verified mention: either a cited source resolves to
 * the brand's own domain (isBrandDomain, which already handles www./
 * subdomains and rejects a competitor whose domain merely contains the
 * brand's as a substring), or the brand's confirmed suburb/city/state
 * appears as a whole word within +/-300 characters of the match.
 * Word-boundary matching matters most for `state`: it's stored as a
 * short AU_STATE_CODES code (lib/constants/au.ts -- "SA", "WA", "NT",
 * ...), and a plain substring check would false-positive on ordinary
 * prose ("anSWer", "aWArd", "coNTent"). Returns "unverified" (not
 * thrown, not "found: false") when neither check passes -- the mention
 * is still real text the engine produced, just not confirmed as THIS
 * business, so lib/audit/organic-citations.ts and
 * lib/scoring/resolve-audit-dimensions.ts stop counting it while the
 * raw citation row is still kept and shown as "Possible mention, not
 * confirmed as your business".
 *
 * One resolver path: both lib/audit/run-audit-inline.ts and
 * inngest/functions/run-audit.ts call this same function; neither has
 * its own copy of the domain or location logic.
 */
export function verifyMention(input: VerifyMentionInput): MentionVerification {
  const domainVerified =
    input.citedSources.some((source) => isBrandDomain(source.domain, input.brand.domain)) ||
    (input.resolvedGroundingDomains ?? []).some((domain) => isBrandDomain(domain, input.brand.domain));
  if (domainVerified) return "verified_domain";

  if (input.matchIndex !== null && input.brand.locationConfirmedAt) {
    const windowStart = Math.max(0, input.matchIndex - LOCATION_WINDOW_CHARS);
    const windowEnd = Math.min(input.responseText.length, input.matchIndex + LOCATION_WINDOW_CHARS);
    const window = input.responseText.slice(windowStart, windowEnd);

    const locationTerms = [input.brand.suburb, input.brand.city, input.brand.state].filter(
      (term): term is string => typeof term === "string" && term.trim().length > 0,
    );
    const locationVerified = locationTerms.some((term) =>
      new RegExp(`\\b${escapeRegExp(term.trim())}\\b`, "i").test(window),
    );
    if (locationVerified) return "verified_location";
  }

  return "unverified";
}
