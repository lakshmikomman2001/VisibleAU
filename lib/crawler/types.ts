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

/**
 * What happened when the crawl asked for the home page (17 Nov, part 3). A site that's down, or that answers our
 * bot with a 403 or 503, gives no pages at all -- and every check that reads the pages then has nothing to read.
 * That is "couldn't reach the site", never a set of measured zeros. Absent when the crawl didn't ask (maxPages 0).
 */
export interface CrawlHomepageOutcome {
  url: string;
  reached: boolean;
  /** The HTTP status it answered with, or null when there was no answer (timeout, DNS, TLS). */
  httpStatus: number | null;
}

/**
 * Whether the sitemap the crawl looked for was there (17 Nov, part 3): "found" only for a 2xx answer that is an
 * XML sitemap (a urlset or sitemapindex), "absent" for a 4xx or a page that isn't one (a soft 404), and
 * "unreachable" for a 5xx or no answer, where nothing can be said either way.
 */
export interface CrawlSitemapOutcome {
  url: string;
  status: "found" | "absent" | "unreachable";
  httpStatus: number | null;
  /** Leftovers task, part 3: why it couldn't be checked ("timed out", "blocked, HTTP 403"), when unreachable. */
  reason?: string;
}

/**
 * The robots.txt request's own answer (17 Nov, part 3): "found", "absent" for a 404 or 410 (no file: nothing is
 * restricted), "unreachable" for anything else -- a 5xx, no answer, and (leftovers task, part 3) a 401/403 or 429:
 * our checker being blocked or rate-limited says nothing about the file or about what an AI crawler gets (RFC 9309
 * lets a crawler treat any 4xx as "no rules", but a block of OUR request isn't a reading of the site's rules).
 * `robotsTxt` null alone can't tell these apart.
 */
export interface CrawlRobotsOutcome {
  status: "found" | "absent" | "unreachable";
  httpStatus: number | null;
  /** Why it couldn't be checked, when unreachable. */
  reason?: string;
}

export interface CrawlResult {
  domain: string;
  pages: CrawlPage[];
  robotsTxt: string | null;
  sitemapXml: string | null;
  crawledAt: Date;
  errors: string[];
  homepage?: CrawlHomepageOutcome;
  sitemap?: CrawlSitemapOutcome;
  robotsTxtFetch?: CrawlRobotsOutcome;
}

// Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2: no `userAgent` option. Every request the crawler makes
// says it's us (lib/product.ts CRAWLER_USER_AGENT); four checks passed "GPTBot/1.1" to see what GPTBot gets,
// which told a site's logs and blocks that OpenAI was visiting.
export interface CrawlOptions {
  maxPages?: number;
  timeoutMs?: number;
}
