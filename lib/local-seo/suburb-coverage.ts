export interface SuburbCoverageResult {
  suburb: string;
  mentionedInContent: boolean;
  mentionedInMeta: boolean;
  mentionedInSchema: boolean;
}

export interface CrawlPage {
  url: string;
  html?: string;
  extractedContent?: { textContent?: string };
  structuredData?: Record<string, unknown>[];
  meta?: { title?: string; description?: string };
}

export interface CrawlResult {
  pages: CrawlPage[];
  structuredData?: { name?: string; address?: string; phone?: string };
}

export function checkSuburbCoverage(
  suburbs: string[],
  crawl: CrawlResult | null,
): SuburbCoverageResult[] {
  if (!suburbs.length) return [];
  if (!crawl?.pages?.length) {
    return suburbs.map((suburb) => ({
      suburb,
      mentionedInContent: false,
      mentionedInMeta: false,
      mentionedInSchema: false,
    }));
  }

  return suburbs.map((suburb) => {
    const subLower = suburb.toLowerCase();

    const mentionedInContent = crawl.pages.some((p) => {
      const text = p.extractedContent?.textContent ?? "";
      return text.toLowerCase().includes(subLower);
    });

    const mentionedInMeta = crawl.pages.some((p) => {
      const title = (p.meta?.title ?? "").toLowerCase();
      const desc = (p.meta?.description ?? "").toLowerCase();
      return title.includes(subLower) || desc.includes(subLower);
    });

    const mentionedInSchema = crawl.pages.some((p) => {
      const schemas = p.structuredData ?? [];
      return schemas.some((sd) => {
        const addr = sd as Record<string, unknown>;
        const locality = String(addr.addressLocality ?? "").toLowerCase();
        const region = String(addr.addressRegion ?? "").toLowerCase();
        return locality.includes(subLower) || region.includes(subLower);
      });
    });

    return { suburb, mentionedInContent, mentionedInMeta, mentionedInSchema };
  });
}
