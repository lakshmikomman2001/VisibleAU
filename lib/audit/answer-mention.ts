import { detectBrandMention, type MentionResult } from "@/lib/audit/detect-mention";
import { type MentionVerification, verifyMention } from "@/lib/audit/verify-mention";

/** Everything about a brand that deciding "mentioned" reads: the name and domain to find, and where it is. */
export interface MentionBrand {
  name: string;
  domain: string;
  suburb: string | null;
  city: string | null;
  state: string | null;
  locationConfirmedAt: Date | null;
  locationMode: "fixed" | "online_only" | null;
}

export interface AnswerMention {
  mention: MentionResult;
  /** null when the name wasn't found: there is nothing to verify (never "unverified"). */
  verification: MentionVerification | null;
}

/**
 * 13 Nov (audit #46): the ONE way an answer is checked for the brand, for the four engines (both audit
 * runners) and for Google's AI Overviews and AI Mode alike, so the two blocks can't disagree on what counts
 * as a mention. Finds the name (lib/audit/detect-mention.ts: any spacing, case, hyphens, "&"/"and",
 * markdown, or the domain), then, only when found, verifies it is THIS business (lib/audit/verify-mention.ts:
 * the brand's own domain among the answer's cited sources, or its confirmed suburb or city near the name).
 * tests/unit/audit/one-mention-check.test.ts fails if a runner or the Google collector calls either half
 * on its own.
 */
export async function answerMention(input: {
  text: string;
  /** The sources the answer cited (Google's own links already left out by the caller). */
  sources: Array<{ domain: string; cited?: boolean }>;
  brand: MentionBrand;
}): Promise<AnswerMention> {
  const mention = await detectBrandMention(input.text, input.brand);
  const verification = mention.found
    ? verifyMention({
        matchIndex: mention.matchIndex,
        responseText: input.text,
        citedSources: input.sources,
        brand: input.brand,
      })
    : null;
  return { mention, verification };
}
