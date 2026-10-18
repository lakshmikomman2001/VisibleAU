import { brandNamePattern } from "@/lib/brands/normalize";

export interface MentionResult {
  found: boolean;
  position: number | null;
  confidence: "high" | "medium" | "low";
  detectionMethod: "regex" | "entity" | "llm" | "none";
}

const BRAND_NAME_REGEX_FLAGS = "gi";

// Vunnara Build 1, Part A: regexDetect now matches through
// lib/brands/normalize.ts's shared brandNamePattern -- the same
// punctuation-tolerant, lookaround-boundary pattern Part B's
// isBrandedPrompt uses, so a quoted/bolded/possessive mention of the
// brand's name is detected the same way everywhere, not via this
// function's own narrower hand-rolled variant list.
function regexDetect(response: string, brandName: string): MentionResult | null {
  const regex = brandNamePattern(brandName);
  const matches = [...response.matchAll(regex)];
  if (matches.length === 0) return null;
  const firstIdx = matches[0].index ?? 0;
  const capitalGroupsBefore = (response.slice(0, firstIdx).match(/[A-Z][a-zA-Z]+/g) ?? []).length;
  return {
    found: true,
    position: capitalGroupsBefore + 1,
    confidence: "high",
    detectionMethod: "regex",
  };
}

function entityDetect(
  response: string,
  brand: { name: string; domain: string },
): MentionResult | null {
  const stem = brand.domain.replace(/\.(com\.au|com|net|org|io|co)$/i, "").replace(/[-.]/g, " ");
  if (stem.length < 4) return null;
  const regex = new RegExp(
    `\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`,
    BRAND_NAME_REGEX_FLAGS,
  );
  const match = regex.exec(response);
  if (match) {
    const capitalGroupsBefore = (response.slice(0, match.index ?? 0).match(/[A-Z][a-zA-Z]+/g) ?? [])
      .length;
    return {
      found: true,
      position: capitalGroupsBefore + 1,
      confidence: "medium",
      detectionMethod: "entity",
    };
  }
  return null;
}

export async function detectBrandMention(
  response: string,
  brand: { name: string; domain: string },
): Promise<MentionResult> {
  const regexResult = regexDetect(response, brand.name);
  if (regexResult) return regexResult;
  const entityResult = entityDetect(response, brand);
  if (entityResult) return entityResult;
  return { found: false, position: null, confidence: "high", detectionMethod: "none" };
}
