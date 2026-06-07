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

export interface CrawlOptions {
  maxPages?: number;
  timeoutMs?: number;
  userAgent?: string;
}
