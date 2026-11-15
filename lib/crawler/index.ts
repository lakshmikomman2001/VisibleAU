import * as cheerio from "cheerio";
import { CRAWLER_USER_AGENT } from "@/lib/product";
import type {
  CrawlHomepageOutcome,
  CrawlOptions,
  CrawlPage,
  CrawlResult,
  CrawlRobotsOutcome,
  CrawlSitemapOutcome,
} from "./types";
import { outcomeForError, outcomeForStatus } from "./fetch-outcome";

// "Vunnara-Audit-Bot/1.0 (+https://vunnara.com.au/about)" (lib/product.ts). The "+URL" is where a site owner
// who sees this bot in their logs reads what it is and how to reach us: the About page says (9 Nov; it named
// the old domain's /bot, which never existed). Renamed from VisibleAU-Audit-Bot on 10 Nov (Sri).
export const DEFAULT_UA = CRAWLER_USER_AGENT;

/** How long robots.txt and the sitemap get to answer (they had no limit; a page gets the crawl's own). */
export const FILE_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_TIMEOUT = 15000;

// 17 Nov, part 3: a page that couldn't be fetched says why -- the status it answered with, or null for no
// answer -- so a crawl that never reached the site is recorded as that, not as a site with nothing on it.
type FetchPageResult = { page: CrawlPage } | { page: null; httpStatus: number | null };

async function fetchPage(url: string, ua: string, timeout: number): Promise<FetchPageResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, {
      headers: { "User-Agent": ua },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return { page: null, httpStatus: res.status };

    const html = await res.text();
    const $ = cheerio.load(html);

    const metaDesc =
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      "";
    const title = $("title").text().trim();

    $("script, style, noscript, iframe, svg, template, nav, footer, header, aside").remove();
    $('[role="navigation"], [role="banner"], .skip-link, .skip-to-content').remove();
    $('a[href="#content"], a[href="#main-content"], a[href="#main"]').remove();
    $(".nav, .navbar, .menu, .top-bar, .announcement, .promo, .banner").remove();

    const contentEl = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
    const textContent = contentEl.text().replace(/\s+/g, " ").trim();
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;
    const excerpt = metaDesc || textContent.slice(0, 200);
    const byline = $('[rel="author"], .author, [itemprop="author"]').first().text().trim() || null;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    return {
      page: {
        url,
        statusCode: res.status,
        title,
        textContent,
        wordCount,
        excerpt,
        byline,
        html,
        headers,
      },
    };
  } catch {
    return { page: null, httpStatus: null };
  }
}

/** A 2xx body that is an XML sitemap: a `<urlset>` or a `<sitemapindex>`, not a site's own HTML page. */
function looksLikeSitemap(body: string): boolean {
  return /<(urlset|sitemapindex)[\s>]/i.test(body);
}

export async function crawlSite(domain: string, opts?: CrawlOptions): Promise<CrawlResult> {
  // No CRAWLER_USER_AGENT env override any more (10 Nov): the sprint 7 setup put the old bot name, with the old
  // domain's /bot link, there, and a deployment that still has it would keep sending them. And no caller's own
  // user agent (part 2 of the af8de42..d1eb5a1 follow-ups): every request is lib/product.ts's constant.
  const ua = DEFAULT_UA;
  const maxPages =
    opts?.maxPages ?? Number(process.env.CRAWLER_MAX_PAGES_PER_SITE ?? DEFAULT_MAX_PAGES);
  const timeout = opts?.timeoutMs ?? Number(process.env.CRAWLER_TIMEOUT_MS ?? DEFAULT_TIMEOUT);

  const baseUrl = `https://${domain}`;
  const pages: CrawlPage[] = [];
  const visited = new Set<string>();
  const errors: string[] = [];

  let robotsTxt: string | null = null;
  // Leftovers task, part 3 (17 Nov): only a 404 or 410 is "no robots.txt" (lib/crawler/fetch-outcome.ts); a 403 or
  // 429 was read as absent ("No robots.txt found -- AI crawler access is undeclared"). And a timeout: it had none.
  let robotsTxtFetch: CrawlRobotsOutcome = { status: "unreachable", httpStatus: null };
  try {
    const r = await fetch(`${baseUrl}/robots.txt`, {
      headers: { "User-Agent": ua },
      signal: AbortSignal.timeout(FILE_FETCH_TIMEOUT_MS),
    });
    if (r.ok) {
      robotsTxt = await r.text();
      robotsTxtFetch = { status: "found", httpStatus: r.status };
    } else {
      const outcome = outcomeForStatus(r.status);
      robotsTxtFetch =
        outcome.state === "unchecked"
          ? { status: "unreachable", httpStatus: r.status, reason: outcome.reason }
          : { status: "absent", httpStatus: r.status };
    }
  } catch (err) {
    const outcome = outcomeForError(err);
    robotsTxtFetch = {
      status: "unreachable",
      httpStatus: null,
      ...(outcome.state === "unchecked" ? { reason: outcome.reason } : {}),
    };
  }

  let sitemapXml: string | null = null;
  const sitemapUrl = robotsTxt?.match(/Sitemap:\s*(.+)/i)?.[1]?.trim() ?? `${baseUrl}/sitemap.xml`;
  let sitemap: CrawlSitemapOutcome = { url: sitemapUrl, status: "unreachable", httpStatus: null };
  try {
    const s = await fetch(sitemapUrl, {
      headers: { "User-Agent": ua },
      signal: AbortSignal.timeout(FILE_FETCH_TIMEOUT_MS),
    });
    if (s.ok) {
      sitemapXml = await s.text();
      sitemap = {
        url: sitemapUrl,
        status: looksLikeSitemap(sitemapXml) ? "found" : "absent",
        httpStatus: s.status,
      };
    } else {
      // Leftovers task, part 3: a 403 or 429 is couldn't check, not "Not found".
      const outcome = outcomeForStatus(s.status);
      sitemap =
        outcome.state === "unchecked"
          ? { url: sitemapUrl, status: "unreachable", httpStatus: s.status, reason: outcome.reason }
          : { url: sitemapUrl, status: "absent", httpStatus: s.status };
    }
  } catch (err) {
    const outcome = outcomeForError(err);
    sitemap = {
      url: sitemapUrl,
      status: "unreachable",
      httpStatus: null,
      ...(outcome.state === "unchecked" ? { reason: outcome.reason } : {}),
    };
  }

  let homepage: CrawlHomepageOutcome | undefined;
  const queue = [baseUrl];
  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift()!;
    const normalized = url.replace(/\/$/, "").toLowerCase();
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    const fetched = await fetchPage(url, ua, timeout);
    // The first request is the home page: the crawl reaches nothing else without it.
    if (!homepage) {
      homepage = {
        url,
        reached: fetched.page !== null,
        httpStatus: fetched.page === null ? fetched.httpStatus : fetched.page.statusCode,
      };
    }
    if (fetched.page === null) {
      errors.push(
        `Failed to fetch ${url}${fetched.httpStatus === null ? " (no answer)" : ` (HTTP ${fetched.httpStatus})`}`,
      );
      continue;
    }
    const page = fetched.page;
    pages.push(page);

    if (pages.length < maxPages) {
      const $ = cheerio.load(page.html);
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        try {
          const abs = new URL(href, url);
          if (abs.hostname === domain && !visited.has(abs.href.replace(/\/$/, "").toLowerCase())) {
            queue.push(abs.href);
          }
        } catch {
          /* invalid URL */
        }
      });
    }
  }

  return {
    domain,
    pages,
    robotsTxt,
    sitemapXml,
    crawledAt: new Date(),
    errors,
    ...(homepage ? { homepage } : {}),
    sitemap,
    robotsTxtFetch,
  };
}

/**
 * A site's robots.txt, read as us. RFC 9309: a 4xx answer means there's no file (nothing is restricted); a
 * 5xx or no answer means it couldn't be read, and then nothing can be said about what it allows.
 */
export type RobotsTxtFetch =
  | { status: "found"; text: string }
  | { status: "absent"; httpStatus: number }
  | { status: "unreachable"; httpStatus: number | null };

export async function fetchRobotsTxt(domain: string, timeoutMs = 5000): Promise<RobotsTxtFetch> {
  try {
    const res = await fetch(`https://${domain}/robots.txt`, {
      headers: { "User-Agent": DEFAULT_UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return { status: "found", text: await res.text() };
    // Leftovers task, part 3: only a 404 or 410 is "no robots.txt" -- a 403 or 429 read as absent made every
    // crawler "allowed" on the CDN join and crawler-access checks.
    if (outcomeForStatus(res.status).state === "absent")
      return { status: "absent", httpStatus: res.status };
    return { status: "unreachable", httpStatus: res.status };
  } catch {
    return { status: "unreachable", httpStatus: null };
  }
}
