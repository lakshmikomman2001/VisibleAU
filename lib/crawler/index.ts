import * as cheerio from "cheerio";
import type { CrawlOptions, CrawlPage, CrawlResult } from "./types";

const DEFAULT_UA = "VisibleAU-Audit-Bot/1.0 (+https://visibleau.com/bot)";
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
    $("script, style, nav, footer, header, aside").remove();
    const textContent = $("body").text().replace(/\s+/g, " ").trim();
    const title = $("title").text().trim();
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;
    const excerpt = textContent.slice(0, 200);
    const byline = $('[rel="author"], .author, [itemprop="author"]').first().text().trim() || null;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });

    return { url, statusCode: res.status, title, textContent, wordCount, excerpt, byline, html, headers };
  } catch {
    return null;
  }
}

export async function crawlSite(domain: string, opts?: CrawlOptions): Promise<CrawlResult> {
  const ua = opts?.userAgent ?? process.env.CRAWLER_USER_AGENT ?? DEFAULT_UA;
  const maxPages = opts?.maxPages ?? Number(process.env.CRAWLER_MAX_PAGES_PER_SITE ?? DEFAULT_MAX_PAGES);
  const timeout = opts?.timeoutMs ?? Number(process.env.CRAWLER_TIMEOUT_MS ?? DEFAULT_TIMEOUT);

  const baseUrl = `https://${domain}`;
  const pages: CrawlPage[] = [];
  const visited = new Set<string>();
  const errors: string[] = [];

  let robotsTxt: string | null = null;
  try {
    const r = await fetch(`${baseUrl}/robots.txt`, { headers: { "User-Agent": ua } });
    if (r.ok) robotsTxt = await r.text();
  } catch { /* ignore */ }

  let sitemapXml: string | null = null;
  try {
    const sitemapUrl = robotsTxt?.match(/Sitemap:\s*(.+)/i)?.[1]?.trim() ?? `${baseUrl}/sitemap.xml`;
    const s = await fetch(sitemapUrl, { headers: { "User-Agent": ua } });
    if (s.ok) sitemapXml = await s.text();
  } catch { /* ignore */ }

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
        } catch { /* invalid URL */ }
      });
    }
  }

  return { domain, pages, robotsTxt, sitemapXml, crawledAt: new Date(), errors };
}
