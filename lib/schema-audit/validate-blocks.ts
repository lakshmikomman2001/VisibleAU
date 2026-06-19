import type { SchemaBlock } from "./extract";

const SCORED_TYPES = ["Organization", "LocalBusiness", "FAQPage", "Article"];

export interface ValidatedSchemaBlock {
  type: string;
  attributeCount: number;
  hasEntityLinking: boolean;
  richness: number;
  status: "valid" | "warning" | "danger";
  issues: string[];
  detail: string;
}

function isScored(type: string): boolean {
  return SCORED_TYPES.some((t) => type.includes(t));
}

function perBlockRichness(block: SchemaBlock): number {
  if (!isScored(block.type)) return 0;
  let r = 1;
  if (block.hasEntityLinking) r += 1;
  if (block.attributeCount >= 5) r += 1;
  if (block.attributeCount >= 10) r += 1;
  return r;
}

export function validateSchemaBlocks(blocks: SchemaBlock[]): ValidatedSchemaBlock[] {
  return blocks.map((block) => {
    const richness = perBlockRichness(block);
    const issues: string[] = [];
    const attrs = block.attributes as Record<string, unknown>;

    if (block.attributeCount < 5) {
      issues.push(
        `Only ${block.attributeCount} attributes populated (below 5+ richness threshold)`,
      );
    }
    if (isScored(block.type) && !block.hasEntityLinking) {
      issues.push("No entity linking (@id, url, or sameAs) — reduces knowledge graph connectivity");
    }

    if (block.type === "AggregateRating" || block.type.includes("Rating")) {
      const rv = attrs.ratingValue;
      const rc = attrs.ratingCount ?? attrs.reviewCount;
      if (rv != null && rc != null) {
        issues.push(
          `Schema claims ${rv}★ across ${rc} reviews — verify these match your actual review page`,
        );
      }
    }

    if (block.type === "FAQPage" || block.type.includes("FAQ")) {
      const mainEntity = attrs.mainEntity;
      if (Array.isArray(mainEntity)) {
        const questions = mainEntity
          .filter((e: Record<string, unknown>) => e["@type"] === "Question")
          .map((e: Record<string, unknown>) => String(e.name ?? ""));
        if (questions.length > 0) {
          issues.push(
            `${questions.length} FAQ questions in schema — verify each exists on the actual FAQ page to prevent LLM hallucination`,
          );
        }
      }
    }

    const hasDangerIssue = issues.some((i) => i.includes("hallucination"));
    const status: "valid" | "warning" | "danger" = hasDangerIssue
      ? "danger"
      : issues.length > 0
        ? "warning"
        : "valid";

    const detail =
      issues.length === 0
        ? `${[
            `${block.attributeCount} attributes populated`,
            block.hasEntityLinking ? "entity-linked" : null,
            isScored(block.type) ? `richness ${richness}/4` : null,
          ]
            .filter(Boolean)
            .join(". ")}.`
        : "";

    return {
      type: block.type,
      attributeCount: block.attributeCount,
      hasEntityLinking: block.hasEntityLinking,
      richness,
      status,
      issues,
      detail,
    };
  });
}
