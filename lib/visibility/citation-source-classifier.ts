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
/**
 * Task #46: Word of Mouth (womo.com.au) was already named in this
 * category's own seed description (db/seed/citation-source-affinity.ts)
 * as an example AU directory, but its actual domain never made it into
 * this pattern list -- the Hipages lesson (task #41) again: docs and
 * code drifting out of sync. Confirmed real via web search + Wikipedia.
 *
 * industry_association: only domains independently confirmed real
 * (web search), not guessed state-variant TLDs. Master Plumbers NSW
 * (mpansw.com.au, confirmed present in live Bondi audit data) and the
 * national Master Plumbers & Mechanical Services Association of
 * Australia (plumber.com.au, confirmed) and masterplumbers.com.au
 * (confirmed, also used by the NSW body); HIA (hia.com.au, confirmed);
 * Master Builders Australia (masterbuilders.com.au, confirmed). State
 * variants like a hypothetical mpavic.com.au/mpaqld.com.au were
 * considered and deliberately excluded -- not independently
 * confirmed, and "don't guess" is an explicit constraint here. See
 * docs/ops/post-launch-db-hardening.md section 46.
 *
 * government_regulator: matched by suffix (any *.gov.au host), not by
 * enumerating specific department domains -- gov.au itself is the
 * reliable, auto-identifiable signal; trying to list every state's
 * fair-trading/licensing authority by name would mean guessing at
 * domains the same way the industry-association ones above were
 * deliberately NOT guessed at.
 */
const URL_PATTERNS: Array<{ pattern: RegExp; type: CitedSourceType }> = [
  { pattern: /reddit\.com/i, type: "reddit_thread" },
  { pattern: /linkedin\.com/i, type: "linkedin_post" },
  { pattern: /youtube\.com|youtu\.be/i, type: "youtube_video" },
  { pattern: /wikipedia\.org/i, type: "wikipedia" },
  {
    pattern:
      /yellowpages\.com\.au|truelocal\.com\.au|hotfrog\.com\.au|localsearch\.com\.au|hipages\.com\.au|oneflare\.com\.au|airtasker\.com|serviceseeking\.com\.au|\bwomo\.com\.au/i,
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
  // Task #46: unlike the generic/brand-name domains above, "plumber"
  // and "hia" are common enough substrings that an unanchored pattern
  // would also match an unrelated real business's domain merely
  // ending in these characters (e.g. "bobsplumber.com.au") -- \b
  // anchors so only the exact domain (or a subdomain of it) matches.
  {
    pattern:
      /\bmpansw\.com\.au\b|\bmasterplumbers\.com\.au\b|\bplumber\.com\.au\b|\bmasterbuilders\.com\.au\b|\bhia\.com\.au\b/i,
    type: "industry_association",
  },
  { pattern: /\.gov\.au\b/i, type: "government_regulator" },
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
