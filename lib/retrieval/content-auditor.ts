import type { CrawlPage } from "@/lib/crawler/types";

export interface ContentAuditResult {
  answerCapsuleScore: number;
  faqBlockPresent: boolean;
  faqSchemaPresent: boolean;
  headingStructure: { tag: string; text: string }[];
  wordCount: number;
  optimalPassageCount: number;
  daysSincePublished: number | null;
  freshnessRisk: "fresh" | "aging" | "at_risk" | "stale";
  contentFormatDetected: string;
  outboundCitationCount: number;
  hasAuthorAttribution: boolean;
}

const CREDIBLE_DOMAINS = [
  ".gov.au", ".edu.au", ".org.au",
  "wikipedia.org", "abs.gov.au",
  "smh.com.au", "theaustralian.com.au", "afr.com", "abc.net.au",
  "pubmed", "arxiv", "nature.com", "springer.com",
];

export function auditContentStructure(page: CrawlPage, lastModifiedDate?: Date | null): ContentAuditResult {
  const html = page.html;
  const text = page.textContent;

  const headingStructure: { tag: string; text: string }[] = [];
  const headingRegex = /<(h[1-6])[^>]*>(.*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(html)) !== null) {
    headingStructure.push({ tag: match[1], text: match[2].replace(/<[^>]+>/g, "").trim() });
  }

  const faqBlockPresent = /<(div|section)[^>]*class="[^"]*faq[^"]*"/i.test(html)
    || headingStructure.some((h) => /faq|frequently asked/i.test(h.text));
  const faqSchemaPresent = /FAQPage/i.test(html);

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  let optimalPassageCount = 0;
  const paragraphs = text.split(/\n\n+/);
  for (const p of paragraphs) {
    const wc = p.split(/\s+/).filter(Boolean).length;
    if (wc >= 134 && wc <= 167) optimalPassageCount++;
  }

  let answerCapsuleScore = 0;
  const questionHeadings = headingStructure.filter((h) => h.text.endsWith("?"));
  if (questionHeadings.length > 0) {
    answerCapsuleScore = Math.min(100, questionHeadings.length * 20);
  }
  if (faqBlockPresent) answerCapsuleScore = Math.min(100, answerCapsuleScore + 20);
  if (faqSchemaPresent) answerCapsuleScore = Math.min(100, answerCapsuleScore + 10);

  let daysSincePublished: number | null = null;
  let freshnessRisk: "fresh" | "aging" | "at_risk" | "stale" = "stale";
  if (lastModifiedDate) {
    daysSincePublished = Math.floor((Date.now() - lastModifiedDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSincePublished < 30) freshnessRisk = "fresh";
    else if (daysSincePublished < 60) freshnessRisk = "aging";
    else if (daysSincePublished < 90) freshnessRisk = "at_risk";
    else freshnessRisk = "stale";
  }

  const contentFormatDetected = detectContentFormat(html, headingStructure, text);

  let outboundCitationCount = 0;
  const linkRegex = /href="(https?:\/\/[^"]+)"/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const href = linkMatch[1];
    if (CREDIBLE_DOMAINS.some((d) => href.includes(d))) {
      outboundCitationCount++;
    }
  }

  const hasAuthorAttribution =
    /name="author"/i.test(html) ||
    /class="[^"]*(?:author|byline|written-by)[^"]*"/i.test(html) ||
    /"@type"\s*:\s*"Person"/i.test(html) ||
    /rel="author"/i.test(html) ||
    page.byline !== null;

  return {
    answerCapsuleScore,
    faqBlockPresent,
    faqSchemaPresent,
    headingStructure,
    wordCount,
    optimalPassageCount,
    daysSincePublished,
    freshnessRisk,
    contentFormatDetected,
    outboundCitationCount,
    hasAuthorAttribution,
  };
}

function detectContentFormat(html: string, headings: { tag: string; text: string }[], text: string): string {
  if (/FAQPage/i.test(html)) return "faq_block";
  const listItems = (html.match(/<li\b/gi) || []).length;
  const h2Count = headings.filter((h) => h.tag === "h2").length;

  if (h2Count >= 3 && /how to|step|guide/i.test(headings[0]?.text ?? "")) return "how_to_guide";
  if (/vs\b|compar|versus|alternative/i.test(text.slice(0, 500))) return "comparison_article";
  if (/case study|case-study|success story/i.test(text.slice(0, 500))) return "case_study";
  if (listItems > 5 && h2Count >= 3) return "listicle";
  if (/product|pricing|plan|buy|cart|add to/i.test(html)) return "product_page";
  if (h2Count >= 2 && text.length > 1000) return "expert_article";
  return "other";
}
