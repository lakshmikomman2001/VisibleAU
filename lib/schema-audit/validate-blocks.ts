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
  /**
   * How many crawled pages carry this exact block (17 Nov, part 3). The page used to list and count one block per
   * page it appeared on, so a sitewide Organization block counted up to 20 times. Absent on audits before then.
   */
  pageCount?: number;
}

/**
 * The distinct blocks across the crawled pages, each with the number of pages it appeared on: two blocks are the
 * same block when their JSON-LD is identical.
 */
export function distinctSchemaBlocks(
  found: Array<{ block: SchemaBlock; pageUrl: string }>,
): Array<{ block: SchemaBlock; pageCount: number }> {
  const byKey = new Map<string, { block: SchemaBlock; pages: Set<string> }>();
  for (const { block, pageUrl } of found) {
    const key = JSON.stringify(block.attributes);
    const seen = byKey.get(key);
    if (seen) seen.pages.add(pageUrl);
    else byKey.set(key, { block, pages: new Set([pageUrl]) });
  }
  return [...byKey.values()].map(({ block, pages }) => ({ block, pageCount: pages.size }));
}

/** validateSchemaBlocks over the distinct blocks, each carrying the number of pages it was found on. */
export function validateDistinctSchemaBlocks(
  found: Array<{ block: SchemaBlock; pageUrl: string }>,
): ValidatedSchemaBlock[] {
  const distinct = distinctSchemaBlocks(found);
  const validated = validateSchemaBlocks(distinct.map((d) => d.block));
  return validated.map((v, i) => ({ ...v, pageCount: distinct[i].pageCount }));
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

    // 17 Nov, part 3: this used to mark every FAQPage with questions "danger" and the page counted it as
    // "Hallucinated" -- but nothing here compares the questions with the page's own text. It is a reminder to
    // check, a warning, never a finding that the schema is wrong.
    if (block.type === "FAQPage" || block.type.includes("FAQ")) {
      const mainEntity = attrs.mainEntity;
      if (Array.isArray(mainEntity)) {
        const questions = mainEntity
          .filter((e: Record<string, unknown>) => e["@type"] === "Question")
          .map((e: Record<string, unknown>) => String(e.name ?? ""));
        if (questions.length > 0) {
          issues.push(
            `${questions.length} FAQ questions in the schema. We don't compare them with your page's text: check each one is asked and answered on the page.`,
          );
        }
      }
    }

    // "danger" is kept in the type for audits stored before 17 Nov; nothing sets it now.
    const status: "valid" | "warning" | "danger" = issues.length > 0 ? "warning" : "valid";

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
