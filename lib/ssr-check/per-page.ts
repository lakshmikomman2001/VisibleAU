import * as cheerio from "cheerio";
import type { CrawlPage, CrawlResult } from "@/lib/crawler/types";

export interface SSRPageCheck {
  path: string;
  jsDisabledContentPct: number;
  criticalCtas: "yes" | "partial" | "no";
  schemaVisible: boolean;
  status: "ok" | "review";
}

export interface ContentSSR {
  healthy: boolean;
  pagesChecked: number;
  pages: SSRPageCheck[];
}

interface SSRCheckResult {
  score: number;
  contentSSR: ContentSSR;
}

const MAX_PAGES = 8;

function pagePath(url: string, domain: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/$/, "") || "/";
  } catch {
    return url.replace(`https://${domain}`, "") || "/";
  }
}

function checkPageSSR(page: CrawlPage, domain: string): SSRPageCheck {
  const $ = cheerio.load(page.html);

  const htmlLen = page.html.length;
  const textLen = page.textContent.length;
  const jsDisabledContentPct =
    htmlLen > 0 ? Math.min(100, Math.round((textLen / Math.max(textLen, htmlLen * 0.3)) * 100)) : 0;

  const hasTel = $('a[href^="tel:"]').length > 0;
  const hasMailto = $('a[href^="mailto:"]').length > 0;
  const hasCtaText = page.html.search(/book|contact|call|quote|enquir|appoint|get started/i) !== -1;
  const ctaCount = [hasTel, hasMailto, hasCtaText].filter(Boolean).length;
  const criticalCtas: "yes" | "partial" | "no" =
    ctaCount >= 2 ? "yes" : ctaCount === 1 ? "partial" : "no";

  const schemaVisible = $('script[type="application/ld+json"]').length > 0;

  const status: "ok" | "review" =
    jsDisabledContentPct >= 70 && criticalCtas === "yes" && schemaVisible ? "ok" : "review";

  return {
    path: pagePath(page.url, domain),
    jsDisabledContentPct,
    criticalCtas,
    schemaVisible,
    status,
  };
}

export async function checkSSR(domain: string, crawl: CrawlResult): Promise<SSRCheckResult> {
  const homepage = crawl.pages[0];
  if (!homepage) {
    return {
      score: 0,
      contentSSR: { healthy: true, pagesChecked: 0, pages: [] },
    };
  }

  const bodyHasContent = homepage.wordCount > 50;
  const hasMetaContent = homepage.html.includes("<meta") && homepage.title.length > 0;
  const ssrRatio = bodyHasContent ? 0.85 : hasMetaContent ? 0.5 : 0.2;

  let score: number;
  if (ssrRatio > 0.7) {
    score = 6;
  } else if (ssrRatio >= 0.4) {
    score = 3;
  } else {
    score = 0;
  }

  const priorityPages = crawl.pages.slice(0, MAX_PAGES);
  const pages = priorityPages.map((p) => checkPageSSR(p, domain));
  const healthy = pages.every((p) => p.status === "ok");

  return {
    score,
    contentSSR: { healthy, pagesChecked: pages.length, pages },
  };
}
