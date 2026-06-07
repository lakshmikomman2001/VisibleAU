import * as cheerio from "cheerio";
import type { CrawlPage } from "@/lib/crawler/types";

export interface SchemaBlock {
  type: string;
  attributes: Record<string, unknown>;
  attributeCount: number;
  hasEntityLinking: boolean;
}

export function extractSchemaBlocks(page: CrawlPage): SchemaBlock[] {
  const $ = cheerio.load(page.html);
  const blocks: SchemaBlock[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item["@type"]) continue;
        const type = Array.isArray(item["@type"]) ? item["@type"][0] : item["@type"];
        const attrs = Object.keys(item).filter((k) => !k.startsWith("@"));
        const hasEntityLinking = !!(item["@id"] || item.url || item.sameAs);
        blocks.push({
          type,
          attributes: item,
          attributeCount: attrs.length,
          hasEntityLinking,
        });
      }
    } catch { /* malformed JSON-LD */ }
  });

  return blocks;
}
