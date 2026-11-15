/**
 * 16 Nov, part 6 -- what a brand's questions are built from when its classifier failed (no classification stored) but
 * its owner confirmed what the business is: those confirmed facts alone -- the first confirmed type (the general local
 * type when there's none), the confirmed audience -- and nothing the classifier would have added (no search phrases,
 * no competitors, no service words: a general brand asks about a "local business" in its suburb). Never stored: it
 * stands in at build time only (lib/prompts/regenerate-prompt-pack.ts, lib/audit/get-audit-prompts.ts).
 *
 * Before, regeneratePromptPack returned without writing a question set when no classification was stored, so the
 * brand stayed stamped behind PROMPT_GENERATOR_VERSION and every audit threw PromptPackGenerationError -- and the
 * classifier never ran again, the brand being 'complete' once confirmed.
 */
import type { Audience, BrandClassification } from "@/lib/types/brand";

const BUYER_TYPE: Record<Audience, BrandClassification["buyerType"]> = {
  households: "consumer",
  businesses: "smb",
  both: "mixed",
};

export function classificationFloor(brand: {
  categories: readonly string[];
  audience: Audience | null;
}): BrandClassification {
  const audience = brand.audience ?? "both";
  return {
    category: brand.categories[0] ?? "general",
    buyerType: BUYER_TYPE[audience],
    audience,
    intentSignals: [],
    competitors: [],
    // Required by the type; nothing that builds questions reads it.
    auRelevance: "au_present",
    confidence: 0,
  };
}
