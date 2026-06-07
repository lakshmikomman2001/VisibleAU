import type { SchemaBlock } from "./extract";

const SCORED_TYPES = ["Organization", "LocalBusiness", "FAQPage", "Article"];

export function schemaRichnessScore(blocks: SchemaBlock[]): number {
  let score = 0;
  for (const type of SCORED_TYPES) {
    const match = blocks.find(
      (b) => b.type === type || b.type.includes(type),
    );
    if (!match) continue;
    score += 1; // present
    if (match.hasEntityLinking) score += 1; // entity linking
    if (match.attributeCount >= 5) score += 1; // rich
    if (match.attributeCount >= 10) score += 1; // comprehensive
  }
  return Math.min(16, score);
}
