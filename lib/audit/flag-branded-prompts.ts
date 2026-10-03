import { buildEnrichedPrompts } from "@/lib/prompts/build-prompt-pack";
import type { BrandClassification } from "@/lib/types/brand";

/**
 * Task QQ: `buildPromptPack`'s enriched pool (comparison/"best alternatives"/
 * "is {brand} popular" prompts) and the raw `brand.promptPack` stored from it
 * are both pre-expanded strings with no surviving `{brand}` template to check
 * via `isBrandedPromptTemplate` -- so flag by provenance instead: a prompt is
 * branded if it's a member of the enriched pool `buildEnrichedPrompts` would
 * deterministically produce for this exact classification + brand name, not
 * by regexing the interpolated text.
 */
export function isBrandedPackPrompt(
  text: string,
  classification: BrandClassification | null | undefined,
  brandName: string,
): boolean {
  if (!classification) return false;
  return buildEnrichedPrompts(classification, brandName).includes(text);
}
