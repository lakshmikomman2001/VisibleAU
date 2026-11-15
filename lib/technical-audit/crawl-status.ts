import type { CrawlResult, CrawlSitemapOutcome } from "@/lib/crawler/types";
import type { TechnicalAuditDimensions } from "./types";

/**
 * 17 Nov, part 3 ("every brand page must agree with the audit"): a technical audit whose crawl never reached the
 * site. lib/crawler fetchPage gave up on any non-2xx answer or a timeout, and the crawl went on as if the site had
 * no pages: meta tags 0, schema 0, content 0, signals a clean 6 of 6, robots.txt +3 for "CDN not blocking". A site
 * that was down read as a measured, badly built site. It is "we couldn't reach it", with the crawl's date, and no
 * score or verdict for any check that needed the pages.
 */

/** Stored as `findings.crawl` on every technical audit from 17 Nov. */
export interface CrawlFindings {
  /** How many pages the crawl fetched. 0 means the home page didn't answer, so the crawl reached nothing. */
  pagesCrawled: number;
  homepageReached: boolean;
  /** The HTTP status the home page answered with; null when there was no answer at all. */
  homepageHttpStatus: number | null;
  /** The sitemap's own fetch: null on a crawl that didn't report it. */
  sitemap: CrawlSitemapOutcome | null;
}

export function crawlFindings(crawl: CrawlResult): CrawlFindings {
  return {
    pagesCrawled: crawl.pages.length,
    homepageReached: crawl.pages.length > 0,
    homepageHttpStatus: crawl.homepage?.httpStatus ?? crawl.pages[0]?.statusCode ?? null,
    sitemap: crawl.sitemap ?? null,
  };
}

export type CrawlReach =
  | { kind: "reached"; pagesCrawled: number }
  | { kind: "unreached"; httpStatus: number | null }
  /** A row that recorded neither: nothing to say either way, so the page shows what it stored. */
  | { kind: "unknown" };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Whether a stored technical audit's crawl reached the site, from its own findings. A row from 17 Nov on says so
 * in `findings.crawl`. An older row still tells: its SSR check ran over every page the crawl fetched
 * (lib/ssr-check/per-page.ts), so `content.ssr.pagesChecked` 0 is a crawl that fetched nothing -- the crawl
 * starts at the home page and finds every other page through it, so 0 pages means the home page didn't answer.
 */
export function crawlReach(findings: unknown): CrawlReach {
  const all = asRecord(findings);
  const crawl = asRecord(all?.crawl);
  if (crawl && typeof crawl.pagesCrawled === "number") {
    if (crawl.pagesCrawled > 0) return { kind: "reached", pagesCrawled: crawl.pagesCrawled };
    return {
      kind: "unreached",
      httpStatus: typeof crawl.homepageHttpStatus === "number" ? crawl.homepageHttpStatus : null,
    };
  }
  const ssr = asRecord(asRecord(all?.content)?.ssr);
  if (ssr && typeof ssr.pagesChecked === "number") {
    return ssr.pagesChecked > 0
      ? { kind: "reached", pagesCrawled: ssr.pagesChecked }
      : { kind: "unreached", httpStatus: null };
  }
  return { kind: "unknown" };
}

/**
 * The checks whose score needs the site to answer: everything but Brand & Entity (the ABN register, Wikipedia and
 * the domain name itself). robots.txt, llms.txt and the AI discovery files are fetched from the site too, and on a
 * site that isn't answering a "not found" there is a request that failed, not a file that's missing.
 */
export const SITE_DEPENDENT_DIMENSIONS = [
  "scoreRobots",
  "scoreLlmsTxt",
  "scoreSchema",
  "scoreMeta",
  "scoreContent",
  "scoreSignals",
  "scoreAiDiscovery",
] as const satisfies ReadonlyArray<keyof TechnicalAuditDimensions>;

export type SiteDependentDimension = (typeof SITE_DEPENDENT_DIMENSIONS)[number];

export function isSiteDependentDimension(key: string): boolean {
  return (SITE_DEPENDENT_DIMENSIONS as readonly string[]).includes(key);
}

/** "Not checked" for one check on a crawl that never reached the site. */
export const NOT_CHECKED_SITE_UNREACHABLE = "Not checked: we couldn't reach the site";

/**
 * What the page says when the crawl never reached the site: the domain, the day, and what it answered.
 * `checkedOn` is the crawl's date already formatted for the reader's time zone ("14/11/2026"), or null.
 */
export function siteUnreachableSentence(
  domain: string,
  checkedOn: string | null,
  httpStatus: number | null,
): string {
  const when = checkedOn ? ` when we crawled it on ${checkedOn}` : " when we crawled it";
  const answer =
    httpStatus === null
      ? " It didn't answer at all (a timeout or a connection error)."
      : ` Its home page answered HTTP ${httpStatus}.`;
  const firewall =
    httpStatus === 401 || httpStatus === 403 || httpStatus === 429 || httpStatus === 503
      ? " A firewall or bot protection can answer crawlers this way."
      : "";
  return `We couldn't reach ${domain}${when}.${answer}${firewall} The checks that read your pages weren't run, so they have no score. Run the audit again once the site answers.`;
}
