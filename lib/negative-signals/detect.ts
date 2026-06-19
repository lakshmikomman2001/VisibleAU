import * as cheerio from "cheerio";
import type { CrawlPage } from "@/lib/crawler/types";

export interface NegativeSignal {
  pattern: string;
  severity: "critical" | "warning" | "info";
  count: number;
  detail: string;
}

export function detectNegativeSignals(page: CrawlPage): NegativeSignal[] {
  const $ = cheerio.load(page.html);
  const signals: NegativeSignal[] = [];
  const pagePath = (() => {
    try {
      return new URL(page.url).pathname;
    } catch {
      return page.url;
    }
  })();

  // 1. CTA overload
  const ctaCount = $('a.btn, button, .cta, [class*="cta"], a[class*="button"]').length;
  if (ctaCount > 12)
    signals.push({
      pattern: "cta-overload",
      severity: "critical",
      count: ctaCount,
      detail: `${ctaCount} calls-to-action on ${pagePath} — above the recommended maximum of 7.`,
    });
  else if (ctaCount > 7)
    signals.push({
      pattern: "cta-overload",
      severity: "warning",
      count: ctaCount,
      detail: `${ctaCount} calls-to-action on ${pagePath} — above the recommended maximum of 7.`,
    });

  // 2. Popup density
  const popupCount = $(
    '[class*="modal"], [class*="popup"], [class*="overlay"], [id*="popup"]',
  ).length;
  if (popupCount > 2)
    signals.push({
      pattern: "popup-density",
      severity: "warning",
      count: popupCount,
      detail: `${popupCount} popup/modal elements on ${pagePath} — may obscure content for AI crawlers.`,
    });

  // 3. Thin content
  if (page.wordCount < 150)
    signals.push({
      pattern: "thin-content",
      severity: "critical",
      count: page.wordCount,
      detail: `${page.wordCount} words on ${pagePath} — below the 300-word minimum for citable content.`,
    });
  else if (page.wordCount < 300)
    signals.push({
      pattern: "thin-content",
      severity: "warning",
      count: page.wordCount,
      detail: `${page.wordCount} words on ${pagePath} — below the 300-word minimum for citable content.`,
    });

  // 4. Keyword stuffing
  const words = page.textContent.toLowerCase().split(/\s+/).filter(Boolean);
  const freq: Record<string, number> = {};
  for (const w of words) {
    if (w.length < 4) continue;
    freq[w] = (freq[w] ?? 0) + 1;
  }
  const total = words.length;
  for (const [term, count] of Object.entries(freq)) {
    const density = (count / total) * 100;
    if (density > 5)
      signals.push({
        pattern: "keyword-stuffing",
        severity: "critical",
        count,
        detail: `'${term}' at ${density.toFixed(1)}% density on ${pagePath} — above the 3% over-optimisation threshold.`,
      });
    else if (density > 3)
      signals.push({
        pattern: "keyword-stuffing",
        severity: "warning",
        count,
        detail: `'${term}' at ${density.toFixed(1)}% density on ${pagePath} — above the 3% over-optimisation threshold.`,
      });
  }

  // 5. Missing author
  const isArticle = $("article, .post, .blog-post").length > 0;
  const hasAuthor = $('[rel="author"], .author, [itemprop="author"]').length > 0;
  if (isArticle && !hasAuthor)
    signals.push({
      pattern: "missing-author",
      severity: "info",
      count: 1,
      detail: `Article content on ${pagePath} has no author attribution — reduces credibility for AI citation.`,
    });

  // 6. High boilerplate ratio
  const navFooterWords = $("nav, footer, aside, header").text().split(/\s+/).filter(Boolean).length;
  const bodyWords = $("body").text().split(/\s+/).filter(Boolean).length;
  if (bodyWords > 0 && navFooterWords / bodyWords > 0.6) {
    const pct = Math.round((navFooterWords / bodyWords) * 100);
    signals.push({
      pattern: "high-boilerplate",
      severity: "warning",
      count: pct,
      detail: `${pct}% of content on ${pagePath} is navigation/footer boilerplate — dilutes extractable content.`,
    });
  }

  // 7. Broken outbound links — skipped during crawl (requires HTTP HEAD checks)

  // 8. Ad density
  const adCount = $('[class*="ad-"], [id*="google_ad"], .advertisement, [class*="adsense"]').length;
  if (adCount > 6)
    signals.push({
      pattern: "ad-density",
      severity: "critical",
      count: adCount,
      detail: `${adCount} ad elements on ${pagePath} — excessive advertising reduces AI trust signals.`,
    });
  else if (adCount > 3)
    signals.push({
      pattern: "ad-density",
      severity: "warning",
      count: adCount,
      detail: `${adCount} ad elements on ${pagePath} — moderate advertising may reduce AI trust signals.`,
    });

  return signals;
}

// 0–6 HEALTH score: 6 = clean, 0 = many/severe negative signals (higher = better for composite)
export function aggregateNegativeScore(allSignals: NegativeSignal[]): number {
  if (allSignals.length === 0) return 6;
  const criticals = allSignals.filter((s) => s.severity === "critical").length;
  const warnings = allSignals.filter((s) => s.severity === "warning").length;
  const penalty = criticals * 2 + warnings * 1;
  return Math.max(0, 6 - penalty);
}
