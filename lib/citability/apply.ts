import type { CrawlResult } from "@/lib/crawler/types";

interface ApplicableMethod {
  methodKey: string;
  title: string;
  effectSizePct: number;
  applicable: boolean;
  reason: string;
}

export function evaluateApplicableMethods(
  methods: Array<{
    methodKey: string;
    title: string;
    effectSizePct: string | null;
    appliesTo: unknown;
  }>,
  crawl: CrawlResult,
): ApplicableMethod[] {
  const allText = crawl.pages.map((p) => p.textContent).join(" ");
  const hasStats = /\d+%|\d+\.\d+/.test(allText);
  const hasQuotes = /"[^"]{20,}"/.test(allText) || /“[^”]{20,}”/.test(allText);
  const hasFaq = crawl.pages.some((p) => p.html.includes("FAQPage") || /faq/i.test(p.url));
  const hasSchema = crawl.pages.some((p) => p.html.includes("application/ld+json"));
  const hasLlmsTxt = crawl.robotsTxt?.includes("llms.txt") ?? false;
  const wordCount = crawl.pages.reduce((s, p) => s + p.wordCount, 0);
  const hasLongContent = wordCount > 2000;

  return methods.map((m) => {
    const effect = Number(m.effectSizePct ?? 0);
    const key = m.methodKey;

    if (key.includes("statistic") && !hasStats)
      return {
        methodKey: key,
        title: m.title,
        effectSizePct: effect,
        applicable: true,
        reason: "No statistics with sources found — add cited data",
      };
    if (key.includes("expert-quote") && !hasQuotes)
      return {
        methodKey: key,
        title: m.title,
        effectSizePct: effect,
        applicable: true,
        reason: "No attributed expert quotes found",
      };
    if (key.includes("faq") && !hasFaq)
      return {
        methodKey: key,
        title: m.title,
        effectSizePct: effect,
        applicable: true,
        reason: "No FAQ schema or FAQ page found",
      };
    if (key.includes("schema") && !hasSchema)
      return {
        methodKey: key,
        title: m.title,
        effectSizePct: effect,
        applicable: true,
        reason: "No structured data found",
      };
    if (key.includes("llms-txt") && !hasLlmsTxt)
      return {
        methodKey: key,
        title: m.title,
        effectSizePct: effect,
        applicable: true,
        reason: "No llms.txt reference in robots.txt",
      };
    if (key.includes("long-form") && !hasLongContent)
      return {
        methodKey: key,
        title: m.title,
        effectSizePct: effect,
        applicable: true,
        reason: "Content is thin — consider longer-form pages",
      };

    return {
      methodKey: key,
      title: m.title,
      effectSizePct: effect,
      applicable: false,
      reason: "Already implemented or not applicable",
    };
  });
}
