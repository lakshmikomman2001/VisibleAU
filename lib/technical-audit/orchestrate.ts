import * as cheerio from "cheerio";
import { checkAiDiscovery } from "@/lib/ai-discovery/endpoints";
import { checkCapsuleQuality } from "@/lib/answer-capsules/check-capsule";
import { findQuestionHeadings } from "@/lib/answer-capsules/find-questions";
import { outcomeForError, outcomeForStatus } from "@/lib/crawler/fetch-outcome";
import type { CrawlResult } from "@/lib/crawler/types";
import { isPlainTextLlmsFile, scoreLlmsTxtDepth } from "@/lib/llms-txt/depth-score";
import { aggregateNegativeScore, detectNegativeSignals } from "@/lib/negative-signals/detect";
import { detectPromptInjections, type PromptInjection } from "@/lib/prompt-injection/detect";
import { analyzeRobots } from "@/lib/robots-txt/analyze";
import { extractSchemaBlocks } from "@/lib/schema-audit/extract";
import { SCHEMA_REALITY_CHECK } from "@/lib/schema-audit/reality-check";
import { schemaRichnessScore } from "@/lib/schema-audit/richness-score";
import { validateDistinctSchemaBlocks } from "@/lib/schema-audit/validate-blocks";
import { checkSSR } from "@/lib/ssr-check/per-page";
import {
  crawlFindings,
  SITE_DEPENDENT_DIMENSIONS,
  type SiteDependentDimension,
} from "./crawl-status";
import { computeTechnicalComposite } from "./score-aggregator";
import { isScoredCheck, scoringForVersion, TECHNICAL_SCORING_VERSION } from "./scoring-version";
import type { TechnicalAuditDimensions } from "./types";

interface OrchestrateResult {
  dimensions: TechnicalAuditDimensions;
  scoreComposite: number;
  findings: Record<string, unknown>;
  /**
   * 17 Nov, part 3: false when the crawl fetched no page (the home page didn't answer). The writer then stores no
   * score for the checks that need the site (crawl-status.ts SITE_DEPENDENT_DIMENSIONS) and no composite: the
   * numbers above are what the scorers return for nothing, not measurements.
   */
  siteReached: boolean;
  /**
   * The checks whose request got no answer (or a 5xx), so their score above isn't a measurement: every
   * site-dependent check when the site wasn't reached, else robots.txt and llms.txt when their own request
   * failed. The writer stores no score for these, and no composite when there are any.
   */
  unmeasured: SiteDependentDimension[];
  /** The unmeasured checks that are scored (20 Nov): only these leave the composite unstored. */
  unmeasuredScored: SiteDependentDimension[];
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
    desc.length === 0
      ? "missing"
      : desc.length < 50
        ? "too_short"
        : desc.length > 160
          ? "too_long"
          : "ok";

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

  // llms.txt. 17 Nov, part 3: what the request got is kept -- a timeout or a 5xx is "couldn't check", never a
  // missing file scored 0 ("Not started").
  let llmsTxtContent: string | null = null;
  let llmsFullContent: string | null = null;
  // Leftovers task, part 3 (17 Nov): only a 404 or 410 is a missing file (lib/crawler/fetch-outcome.ts) -- a 403 or
  // 429 was "absent" -- and llms-full.txt keeps its own answer too: a timeout or an error there was "not found",
  // scored 0 of 3 ("llms-full.txt companion").
  let llmsTxtFetch: "found" | "absent" | "unreachable" = "unreachable";
  let llmsTxtFetchReason: string | null = null;
  try {
    const r = await fetch(`https://${domain}/llms.txt`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const body = await r.text();
      if (isPlainTextLlmsFile(r.headers.get("content-type"), body)) llmsTxtContent = body;
      // A 2xx that isn't a plain-text file (the site's own HTML page) is a missing file.
      llmsTxtFetch = llmsTxtContent ? "found" : "absent";
    } else {
      const outcome = outcomeForStatus(r.status);
      llmsTxtFetch = outcome.state === "absent" ? "absent" : "unreachable";
      if (outcome.state === "unchecked") llmsTxtFetchReason = outcome.reason;
    }
  } catch (err) {
    const outcome = outcomeForError(err);
    if (outcome.state === "unchecked") llmsTxtFetchReason = outcome.reason;
  }
  let llmsFullFetch: "found" | "absent" | "unreachable" = "unreachable";
  let llmsFullFetchReason: string | null = null;
  try {
    const r = await fetch(`https://${domain}/llms-full.txt`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const body = await r.text();
      if (isPlainTextLlmsFile(r.headers.get("content-type"), body)) llmsFullContent = body;
      llmsFullFetch = llmsFullContent ? "found" : "absent";
    } else {
      const outcome = outcomeForStatus(r.status);
      llmsFullFetch = outcome.state === "absent" ? "absent" : "unreachable";
      if (outcome.state === "unchecked") llmsFullFetchReason = outcome.reason;
    }
  } catch (err) {
    const outcome = outcomeForError(err);
    if (outcome.state === "unchecked") llmsFullFetchReason = outcome.reason;
  }
  // The depth score counts the companion file only when there's an llms.txt to score; then a companion that
  // couldn't be checked leaves the score unmeasured, never 3 points short.
  const llmsScoreUnchecked =
    llmsTxtFetch === "unreachable" || (llmsTxtFetch === "found" && llmsFullFetch === "unreachable");
  const llmsTxt = scoreLlmsTxtDepth(llmsTxtContent, llmsFullContent);

  // Schema. The score reads every block found (unchanged); the stored list is the distinct blocks, each with
  // the number of pages it was on (17 Nov, part 3), so a sitewide block is one block, not one per page.
  const schemaFound = crawl.pages.flatMap((p) =>
    extractSchemaBlocks(p).map((block) => ({ block, pageUrl: p.url })),
  );
  const allSchemaBlocks = schemaFound.map((f) => f.block);
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

  // 20 Nov (Sri's decision): scored under TECHNICAL_SCORING_VERSION. llms.txt and ai.txt are checked and shown, and earn
  // nothing (lib/technical-audit/scoring-version.ts): llms.txt's depth checklist is kept in its findings, its score is 0.
  const scoring = scoringForVersion(TECHNICAL_SCORING_VERSION);
  const dimensions: TechnicalAuditDimensions = {
    scoreRobots: robots.score,
    scoreLlmsTxt: isScoredCheck(scoring, "scoreLlmsTxt") ? llmsTxt.score : 0,
    scoreSchema: schemaScore,
    scoreMeta: meta.score,
    scoreContent: Math.min(12, contentScore),
    scoreBrandEntity: brandEntityScore,
    scoreSignals: signalsScore,
    scoreAiDiscovery: aiDiscovery.score,
  };

  const scoreComposite = computeTechnicalComposite(dimensions);

  const findings = {
    // 20 Nov: which scoring rules this audit was scored under, so it's only ever compared with audits scored the same
    // way (lib/technical-audit/scoring-version.ts).
    scoringVersion: TECHNICAL_SCORING_VERSION,
    // 17 Nov, part 3: whether the crawl reached the site (lib/technical-audit/crawl-status.ts).
    crawl: crawlFindings(crawl),
    robots: robots.findings,
    llmsTxt: {
      fetchStatus: llmsTxtFetch,
      ...(llmsTxtFetchReason ? { fetchReason: llmsTxtFetchReason } : {}),
      fullFetchStatus: llmsFullFetch,
      ...(llmsFullFetchReason ? { fullFetchReason: llmsFullFetchReason } : {}),
      present: !!llmsTxtContent,
      url: llmsTxtContent ? `https://${domain}/llms.txt` : null,
      // The depth checklist's points, kept for the checklist: from 20 Nov they're not part of any score.
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
      blocks: validateDistinctSchemaBlocks(schemaFound),
      // How many pages the blocks were read from, so the page can say "on N pages".
      pagesScanned: crawl.pages.length,
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

  const siteReached = crawl.pages.length > 0;
  const unmeasured: SiteDependentDimension[] = !siteReached
    ? [...SITE_DEPENDENT_DIMENSIONS]
    : [
        ...(robots.readable ? [] : (["scoreRobots"] as const)),
        ...(llmsScoreUnchecked ? (["scoreLlmsTxt"] as const) : []),
        // Leftovers task, part 3: an AI-discovery file that couldn't be checked leaves that score unmeasured.
        ...(aiDiscovery.measured ? [] : (["scoreAiDiscovery"] as const)),
      ];
  // 20 Nov: a check that isn't scored can't leave the composite unmeasured -- a failed llms.txt or ai.txt request says
  // so on its own row ("Couldn't check · not scored"), and the score stands.
  const unmeasuredScored = unmeasured.filter((key) => isScoredCheck(scoring, key));

  return { dimensions, scoreComposite, findings, siteReached, unmeasured, unmeasuredScored };
}
