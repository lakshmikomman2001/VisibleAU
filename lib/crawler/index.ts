import * as cheerio from "cheerio";
import { CRAWLER_USER_AGENT } from "@/lib/product";
import type { CrawlOptions, CrawlPage, CrawlResult } from "./types";

// "Vunnara-Audit-Bot/1.0 (+https://vunnara.com.au/about)" (lib/product.ts). The "+URL" is where a site owner
// who sees this bot in their logs reads what it is and how to reach us: the About page says (9 Nov; it named
// the old domain's /bot, which never existed). Renamed from VisibleAU-Audit-Bot on 10 Nov (Sri).
export const DEFAULT_UA = CRAWLER_USER_AGENT;
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_TIMEOUT = 15000;

async function fetchPage(url: string, ua: string, timeout: number): Promise<CrawlPage | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, {
      headers: { "User-Agent": ua },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;

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
      url,
      statusCode: res.status,
      title,
      textContent,
      wordCount,
      excerpt,
      byline,
      html,
      headers,
    };
  } catch {
    return null;
  }
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
  try {
    const r = await fetch(`${baseUrl}/robots.txt`, { headers: { "User-Agent": ua } });
    if (r.ok) robotsTxt = await r.text();
  } catch {
    /* ignore */
  }

  let sitemapXml: string | null = null;
  try {
    const sitemapUrl =
      robotsTxt?.match(/Sitemap:\s*(.+)/i)?.[1]?.trim() ?? `${baseUrl}/sitemap.xml`;
    const s = await fetch(sitemapUrl, { headers: { "User-Agent": ua } });
    if (s.ok) sitemapXml = await s.text();
  } catch {
    /* ignore */
  }

  const queue = [baseUrl];
  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift()!;
    const normalized = url.replace(/\/$/, "").toLowerCase();
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    const page = await fetchPage(url, ua, timeout);
    if (!page) {
      errors.push(`Failed to fetch ${url}`);
      continue;
    }
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

  return { domain, pages, robotsTxt, sitemapXml, crawledAt: new Date(), errors };
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
    if (res.status >= 400 && res.status < 500) return { status: "absent", httpStatus: res.status };
    return { status: "unreachable", httpStatus: res.status };
  } catch {
    return { status: "unreachable", httpStatus: null };
  }
}
