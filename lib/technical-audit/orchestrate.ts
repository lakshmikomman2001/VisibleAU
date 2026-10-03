import * as cheerio from "cheerio";
import { checkAiDiscovery } from "@/lib/ai-discovery/endpoints";
import { checkCapsuleQuality } from "@/lib/answer-capsules/check-capsule";
import { findQuestionHeadings } from "@/lib/answer-capsules/find-questions";
import type { CrawlResult } from "@/lib/crawler/types";
import { isPlainTextLlmsFile, scoreLlmsTxtDepth } from "@/lib/llms-txt/depth-score";
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

// Task UU: the single source of truth for Meta Tags weights -- the
// meta-tags display page imports these instead of hand-maintaining its own
// copy, which is how it drifted to 3/3/3/3/2 against these real weights.
export const META_WEIGHTS = {
  title: 4,
  description: 3,
  og: 3,
  canonical: 2,
  hreflang: 2,
} as const;

export type DescriptionVerdict = "missing" | "too_short" | "too_long" | "ok";

export interface MetaFindings {
  score: number;
  titlePresent: boolean;
  descriptionPresent: boolean;
  // Granular state behind descriptionPresent/ogPresent (task UU) -- without
  // these, a present-but-imperfect description or a 2-of-3 Open Graph set
  // is indistinguishable from fully absent once collapsed to a boolean.
  descriptionLength: number;
  descriptionVerdict: DescriptionVerdict;
  ogPresent: boolean;
  ogTitle: boolean;
  ogDesc: boolean;
  ogImage: boolean;
  canonicalPresent: boolean;
  hreflangPresent: boolean;
}

export function scoreMeta(crawl: CrawlResult): { score: number; findings: MetaFindings } {
  const page = crawl.pages[0];
  if (!page)
    return {
      score: 0,
      findings: {
        score: 0,
        titlePresent: false,
        descriptionPresent: false,
        descriptionLength: 0,
        descriptionVerdict: "missing",
        ogPresent: false,
        ogTitle: false,
        ogDesc: false,
        ogImage: false,
        canonicalPresent: false,
        hreflangPresent: false,
      },
    };

  const $ = cheerio.load(page.html);
  let score = 0;

  const titlePresent = page.title.length >= 10;
  if (titlePresent) score += META_WEIGHTS.title;

  const desc = $('meta[name="description"]').attr("content") ?? "";
  const descriptionPresent = desc.length >= 50 && desc.length <= 160;
  if (descriptionPresent) score += META_WEIGHTS.description;
  const descriptionVerdict: DescriptionVerdict =
    desc.length === 0 ? "missing" : desc.length < 50 ? "too_short" : desc.length > 160 ? "too_long" : "ok";

  const ogTitle = $('meta[property="og:title"]').length > 0;
  const ogDesc = $('meta[property="og:description"]').length > 0;
  const ogImage = $('meta[property="og:image"]').length > 0;
  const ogPresent = ogTitle && ogDesc && ogImage;
  if (ogPresent) score += META_WEIGHTS.og;

  const canonicalPresent = $('link[rel="canonical"]').length > 0;
  if (canonicalPresent) score += META_WEIGHTS.canonical;

  const hreflangPresent = $("link[hreflang]").length > 0;
  if (hreflangPresent) score += META_WEIGHTS.hreflang;

  return {
    score: Math.min(14, score),
    findings: {
      score: Math.min(14, score),
      titlePresent,
      descriptionPresent,
      descriptionLength: desc.length,
      descriptionVerdict,
      ogPresent,
      ogTitle,
      ogDesc,
      ogImage,
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
    if (r.ok) {
      const body = await r.text();
      if (isPlainTextLlmsFile(r.headers.get("content-type"), body)) llmsTxtContent = body;
    }
  } catch {
    /* not found */
  }
  try {
    const r = await fetch(`https://${domain}/llms-full.txt`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const body = await r.text();
      if (isPlainTextLlmsFile(r.headers.get("content-type"), body)) llmsFullContent = body;
    }
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
      // The real 6 per-component booleans (task GG) -- previously only the
      // summed score was kept, forcing the generator page to guess the
      // breakdown from the total via wrong cumulative thresholds.
      components: llmsTxt.components,
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
      capsuleFinding: capsules.finding,
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
