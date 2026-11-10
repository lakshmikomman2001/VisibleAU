export interface CrawlPage {
  url: string;
  statusCode: number;
  title: string;
  textContent: string;
  wordCount: number;
  excerpt: string;
  byline: string | null;
  html: string;
  headers: Record<string, string>;
}

export interface CrawlResult {
  domain: string;
  pages: CrawlPage[];
  robotsTxt: string | null;
  sitemapXml: string | null;
  crawledAt: Date;
  errors: string[];
}

// Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2: no `userAgent` option. Every request the crawler makes
// says it's us (lib/product.ts CRAWLER_USER_AGENT); four checks passed "GPTBot/1.1" to see what GPTBot gets,
// which told a site's logs and blocks that OpenAI was visiting.
export interface CrawlOptions {
  maxPages?: number;
  timeoutMs?: number;
}
