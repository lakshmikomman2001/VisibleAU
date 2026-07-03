import type { CitedSourceType, EngineAffinity } from "./types";

const URL_PATTERNS: Array<{ pattern: RegExp; type: CitedSourceType }> = [
  { pattern: /reddit\.com/i, type: "reddit_thread" },
  { pattern: /linkedin\.com/i, type: "linkedin_post" },
  { pattern: /youtube\.com|youtu\.be/i, type: "youtube_video" },
  { pattern: /wikipedia\.org/i, type: "wikipedia" },
  { pattern: /yellowpages\.com\.au|truelocal\.com\.au|hotfrog\.com\.au|localsearch\.com\.au/i, type: "au_directory" },
  { pattern: /productreview\.com\.au|trustpilot\.com|google\.com\/maps/i, type: "review_site" },
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

export function classifySourceTypeWithBrand(
  url: string,
  brandDomain: string,
): CitedSourceType {
  if (
    brandDomain &&
    url.toLowerCase().includes(brandDomain.toLowerCase())
  ) {
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
