import type { CitedSourceType, EngineAffinity } from "./types";

/**
 * Task #41: the directory list was missing the real AU trade
 * directories/marketplaces -- hipages, oneflare, airtasker, and
 * serviceseeking are exactly the sites a local trade business (the
 * au_directory seed description in db/seed/citation-source-affinity.ts
 * already names Hipages as an example) actually gets cited from, but
 * none of them matched any pattern, so they all fell through to
 * "other". Google Business Profile is classified as review_site --
 * same underlying local-business/review data surface as the existing
 * google.com/maps pattern, not a new category. See
 * docs/ops/post-launch-db-hardening.md section 41.
 */
const URL_PATTERNS: Array<{ pattern: RegExp; type: CitedSourceType }> = [
  { pattern: /reddit\.com/i, type: "reddit_thread" },
  { pattern: /linkedin\.com/i, type: "linkedin_post" },
  { pattern: /youtube\.com|youtu\.be/i, type: "youtube_video" },
  { pattern: /wikipedia\.org/i, type: "wikipedia" },
  {
    pattern:
      /yellowpages\.com\.au|truelocal\.com\.au|hotfrog\.com\.au|localsearch\.com\.au|hipages\.com\.au|oneflare\.com\.au|airtasker\.com|serviceseeking\.com\.au/i,
    type: "au_directory",
  },
  {
    pattern:
      /productreview\.com\.au|trustpilot\.com|google\.com\/maps|business\.google\.com|g\.page/i,
    type: "review_site",
  },
  {
    pattern: /news\.com\.au|abc\.net\.au|smh\.com\.au|theaustralian\.com|9news\.com|7news\.com/i,
    type: "news_article",
  },
];

const ENGINE_AFFINITY_MAP: Partial<Record<CitedSourceType, EngineAffinity>> = {
  reddit_thread: "perplexity_primary",
  linkedin_post: "chatgpt_primary",
  youtube_video: "gemini_primary",
  wikipedia: "all",
  news_article: "all",
};

export function classifySourceType(url: string): CitedSourceType {
  for (const { pattern, type } of URL_PATTERNS) {
    if (pattern.test(url)) return type;
  }
  return "other";
}

export function classifySourceTypeWithBrand(url: string, brandDomain: string): CitedSourceType {
  if (brandDomain && url.toLowerCase().includes(brandDomain.toLowerCase())) {
    return "brand_owned";
  }
  return classifySourceType(url);
}

export function getEngineAffinity(sourceType: CitedSourceType): EngineAffinity {
  return ENGINE_AFFINITY_MAP[sourceType] ?? null;
}

export interface ClassifiedSource {
  url: string;
  sourceType: CitedSourceType;
  engineAffinity: EngineAffinity;
}

export function classifyCitedSources(
  sources: Array<{ url: string }>,
  brandDomain: string,
): ClassifiedSource[] {
  return sources.map((s) => {
    const sourceType = classifySourceTypeWithBrand(s.url, brandDomain);
    return {
      url: s.url,
      sourceType,
      engineAffinity: getEngineAffinity(sourceType),
    };
  });
}
