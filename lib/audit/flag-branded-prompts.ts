import { brandNamePattern, domainStem } from "@/lib/brands/normalize";

/**
 * Vunnara Build 1, Part B: the ONE branded-prompt rule, checked on the
 * prompt's final text -- replaces two rules that each got it wrong in a
 * different direction:
 *
 * - isBrandedPromptTemplate (lib/verticals/expand-prompt.ts, deleted):
 *   checked the unexpanded TEMPLATE for a surviving `{brand}`
 *   placeholder. An already-expanded, intentSignal-derived prompt (no
 *   `{brand}` in its source template at all) that happens not to
 *   mention the brand was never checked here -- Omega's 2 intentSignal
 *   prompts were wrongly flagged branded via the OTHER rule below, not
 *   caught as organic by this one either, since this rule never saw
 *   them.
 * - isBrandedPackPrompt (this file, deleted): flagged by POOL
 *   MEMBERSHIP -- true iff the text exactly matched one of
 *   buildEnrichedPrompts' deterministic outputs for this classification.
 *   That's provenance, not content: it wrongly flagged intentSignal-
 *   derived enriched prompts as branded (they never name the brand) and
 *   never flagged a `{domain}`-only template as branded at all (no rule
 *   ever checked for the domain).
 *
 * True iff the text itself names the brand (brandNamePattern) or
 * contains the brand's domain (domainStem, ignoring stems under 4
 * characters -- too likely to false-positive on a short, generic
 * domain fragment).
 */
export function isBrandedPrompt(
  promptText: string,
  brand: { name: string; domain: string },
): boolean {
  if (brandNamePattern(brand.name).test(promptText)) return true;

  const stem = domainStem(brand.domain);
  if (stem.length < 4) return false;
  // Strip the same way the stem itself was derived, so "omega-services.
  // com.au" literally appearing in the prompt text (expandPrompt's
  // {domain} substitution keeps the raw domain, punctuation and all)
  // still registers as containing the stem "omegaservices".
  const strippedPromptText = promptText.toLowerCase().replace(/[^a-z0-9]/g, "");
  return strippedPromptText.includes(stem);
}
