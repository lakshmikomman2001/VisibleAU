import * as cheerio from "cheerio";
import type { CrawlPage, CrawlResult } from "@/lib/crawler/types";

// Task YY: the single no-JS fetch this check has can only honestly answer
// one question -- how much substantive content is present in the
// server-rendered HTML a no-JS crawler sees. It cannot answer "what would
// this look like with JS" (that needs a real headless render, deferred as
// option A) and comparing it against 30% of the page's TOTAL raw bytes
// (scripts/CSS/nav/footer included) was a false-negative: real
// server-rendered content read as "needs review" purely because the page
// also ships normal boilerplate markup. hasContentMin matches checkSSR's
// own existing "has content at all" floor below; goodContentMin is a higher
// bar for "substantially developed", not a magic number inline.
export const SSR_CONTENT_THRESHOLDS = {
  hasContentMin: 50,
  goodContentMin: 300,
} as const;

export type SsrContentVerdict = "good" | "thin" | "none";

export function classifySsrContent(wordCount: number): SsrContentVerdict {
  if (wordCount >= SSR_CONTENT_THRESHOLDS.goodContentMin) return "good";
  if (wordCount >= SSR_CONTENT_THRESHOLDS.hasContentMin) return "thin";
  return "none";
}

export interface SSRPageCheck {
  path: string;
  wordCount: number;
  contentVerdict: SsrContentVerdict;
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

export function checkPageSSR(page: CrawlPage, domain: string): SSRPageCheck {
  const $ = cheerio.load(page.html);

  const contentVerdict = classifySsrContent(page.wordCount);

  const hasTel = $('a[href^="tel:"]').length > 0;
  const hasMailto = $('a[href^="mailto:"]').length > 0;
  const hasCtaText = page.html.search(/book|contact|call|quote|enquir|appoint|get started/i) !== -1;
  const ctaCount = [hasTel, hasMailto, hasCtaText].filter(Boolean).length;
  const criticalCtas: "yes" | "partial" | "no" =
    ctaCount >= 2 ? "yes" : ctaCount === 1 ? "partial" : "no";

  const schemaVisible = $('script[type="application/ld+json"]').length > 0;

  // Task YY: status reflects the one thing this single-fetch check can
  // honestly support -- substantial server-rendered content. criticalCtas
  // and schemaVisible stay as real, separately-shown signals, but no longer
  // gate "ok" -- the old compound AND made "fully server-side" near
  // impossible (schemaVisible is false for any page with no JSON-LD,
  // regardless of how well-rendered its content is).
  const status: "ok" | "review" = contentVerdict === "good" ? "ok" : "review";

  return {
    path: pagePath(page.url, domain),
    wordCount: page.wordCount,
    contentVerdict,
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

  // Unchanged from before task YY (same constant, same operator) -- this
  // scoring path (feeds scoreContent) is explicitly out of scope for this
  // task, only the display-only per-page metric below changes.
  const bodyHasContent = homepage.wordCount > SSR_CONTENT_THRESHOLDS.hasContentMin;
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
