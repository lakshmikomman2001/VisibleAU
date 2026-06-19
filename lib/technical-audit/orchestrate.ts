import * as cheerio from "cheerio";
import { checkAiDiscovery } from "@/lib/ai-discovery/endpoints";
import { checkCapsuleQuality } from "@/lib/answer-capsules/check-capsule";
import { findQuestionHeadings } from "@/lib/answer-capsules/find-questions";
import type { CrawlResult } from "@/lib/crawler/types";
import { scoreLlmsTxtDepth } from "@/lib/llms-txt/depth-score";
import { aggregateNegativeScore, detectNegativeSignals } from "@/lib/negative-signals/detect";
import { detectPromptInjections, type PromptInjection } from "@/lib/prompt-injection/detect";
import { analyzeRobots } from "@/lib/robots-txt/analyze";
import { extractSchemaBlocks } from "@/lib/schema-audit/extract";
import { SCHEMA_REALITY_CHECK } from "@/lib/schema-audit/reality-check";
import { schemaRichnessScore } from "@/lib/schema-audit/richness-score";
import { validateSchemaBlocks } from "@/lib/schema-audit/validate-blocks";
import { checkSSR } from "@/lib/ssr-check/per-page";
import { computeTechnicalComposite } from "./score-aggregator";
import type { TechnicalAuditDimensions } from "./types";

interface OrchestrateResult {
  dimensions: TechnicalAuditDimensions;
  scoreComposite: number;
  findings: Record<string, unknown>;
}

function deduplicateInjections(all: PromptInjection[]): PromptInjection[] {
  const groups = new Map<string, { first: PromptInjection; pages: string[] }>();
  for (const inj of all) {
    const key = `${inj.pattern}|${inj.element}`;
    const path = inj.detail.match(/ on (\/\S+)/)?.[1] ?? "unknown";
    const existing = groups.get(key);
    if (existing) {
      if (!existing.pages.includes(path)) existing.pages.push(path);
    } else {
      groups.set(key, { first: inj, pages: [path] });
    }
  }
  return [...groups.values()].map(({ first, pages }) => {
    if (pages.length <= 1) return first;
    const baseDetail = first.detail.replace(/ on \/\S+/, `, site-wide (${pages.length} pages)`);
    return { ...first, detail: baseDetail, pagesAffected: pages };
  });
}

function scoreMeta(crawl: CrawlResult): { score: number; findings: Record<string, unknown> } {
  const page = crawl.pages[0];
  if (!page)
    return {
      score: 0,
      findings: {
        score: 0,
        titlePresent: false,
        descriptionPresent: false,
        ogPresent: false,
        canonicalPresent: false,
        hreflangPresent: false,
      },
    };

  const $ = cheerio.load(page.html);
  let score = 0;

  const titlePresent = page.title.length >= 10;
  if (titlePresent) score += 4;

  const desc = $('meta[name="description"]').attr("content") ?? "";
  const descriptionPresent = desc.length >= 50 && desc.length <= 160;
  if (descriptionPresent) score += 3;

  const ogTitle = $('meta[property="og:title"]').length > 0;
  const ogDesc = $('meta[property="og:description"]').length > 0;
  const ogImage = $('meta[property="og:image"]').length > 0;
  const ogPresent = ogTitle && ogDesc && ogImage;
  if (ogPresent) score += 3;

  const canonicalPresent = $('link[rel="canonical"]').length > 0;
  if (canonicalPresent) score += 2;

  const hreflangPresent = $("link[hreflang]").length > 0;
  if (hreflangPresent) score += 2;

  return {
    score: Math.min(14, score),
    findings: {
      score: Math.min(14, score),
      titlePresent,
      descriptionPresent,
      ogPresent,
      canonicalPresent,
      hreflangPresent,
    },
  };
}

export async function orchestrateTechnicalAudit(
  domain: string,
  crawl: CrawlResult,
  brandEntityScoreOverride?: number,
): Promise<OrchestrateResult> {
  // Robots
  const robots = analyzeRobots(crawl);

  // llms.txt
  let llmsTxtContent: string | null = null;
  let llmsFullContent: string | null = null;
  try {
    const r = await fetch(`https://${domain}/llms.txt`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) llmsTxtContent = await r.text();
  } catch {
    /* not found */
  }
  try {
    const r = await fetch(`https://${domain}/llms-full.txt`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) llmsFullContent = await r.text();
  } catch {
    /* not found */
  }
  const llmsTxt = scoreLlmsTxtDepth(llmsTxtContent, llmsFullContent);

  // Schema
  const allSchemaBlocks = crawl.pages.flatMap((p) => extractSchemaBlocks(p));
  const schemaScore = schemaRichnessScore(allSchemaBlocks);
  const schemaTypes = [...new Set(allSchemaBlocks.map((b) => b.type))];
  const schemaGaps = ["Organization", "LocalBusiness", "FAQPage", "Article"].filter(
    (t) => !schemaTypes.some((st) => st.includes(t)),
  );

  // Meta
  const meta = scoreMeta(crawl);

  // SSR + Answer Capsules → Content
  const ssr = await checkSSR(domain, crawl);
  const allQuestions = crawl.pages.flatMap((p) => findQuestionHeadings(p));
  const capsules = checkCapsuleQuality(allQuestions);
  const contentScore = ssr.score + capsules.score;

  // AI Discovery
  const aiDiscovery = await checkAiDiscovery(domain);

  // Negative Signals + Prompt Injection → Signals
  const allNegSignals = crawl.pages.flatMap((p) => detectNegativeSignals(p));
  const allInjections = deduplicateInjections(
    crawl.pages.flatMap((p) => detectPromptInjections(p)),
  );
  const signalsScore = aggregateNegativeScore(allNegSignals);

  const brandEntityScore = brandEntityScoreOverride ?? 0;

  const dimensions: TechnicalAuditDimensions = {
    scoreRobots: robots.score,
    scoreLlmsTxt: llmsTxt.score,
    scoreSchema: schemaScore,
    scoreMeta: meta.score,
    scoreContent: Math.min(12, contentScore),
    scoreBrandEntity: brandEntityScore,
    scoreSignals: signalsScore,
    scoreAiDiscovery: aiDiscovery.score,
  };

  const scoreComposite = computeTechnicalComposite(dimensions);

  const findings = {
    robots: robots.findings,
    llmsTxt: {
      present: !!llmsTxtContent,
      url: llmsTxtContent ? `https://${domain}/llms.txt` : null,
      depthScore: llmsTxt.score,
      issues: [] as string[],
      hasFullTxt: !!llmsFullContent,
      sizeKb: llmsTxtContent ? Math.round(llmsTxtContent.length / 1024) : 0,
    },
    schema: {
      typesFound: schemaTypes,
      richness: schemaScore,
      gaps: schemaGaps,
      realityCheck: SCHEMA_REALITY_CHECK,
      blocks: validateSchemaBlocks(allSchemaBlocks),
    },
    meta: meta.findings,
    content: {
      score: Math.min(12, contentScore),
      wordCount: crawl.pages.reduce((s, p) => s + p.wordCount, 0),
      answerCapsulesFound: capsules.questionsWithCapsule,
      answerCapsulesSuggested: capsules.totalQuestions - capsules.questionsWithCapsule,
      questions: allQuestions.map((q) => ({
        heading: q.question,
        hasCapsule: q.hasCapsule,
        excerpt: q.followingText.slice(0, 200),
      })),
      ssr: ssr.contentSSR,
      negativeSignals: allNegSignals,
      promptInjections: allInjections,
    },
    brandEntity: {
      score: brandEntityScore,
      abnVerified: false,
      abnNumber: null,
      wikipediaAuPresent: false,
      auTldPresent: false,
      directoryPresence: [],
    },
    signals: { score: signalsScore },
    aiDiscovery: aiDiscovery.findings,
  };

  return { dimensions, scoreComposite, findings };
}
