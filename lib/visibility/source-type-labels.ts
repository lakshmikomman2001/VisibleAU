import type { CitedSourceType } from "./types";

/**
 * Task #46 follow-up: the one shared display-label map for a
 * CitedSourceType value. Several surfaces (the Citation Sources cards,
 * the PDF report's "Source Type Gaps" section) used to each fall back
 * to `sourceType.replace(/_/g, " ")`, which reads fine for a two-word
 * snake_case key but leaves proper nouns lowercase ("wikipedia",
 * "youtube video") and undersells the two explicitly-labelled
 * categories ("industry association", "government regulator"; see the
 * long-standing overrides this replaces). `Record<CitedSourceType,
 * string>` keeps this exhaustive -- the compiler errors if
 * CitedSourceType ever gains a member this map doesn't cover.
 */
const SOURCE_TYPE_LABELS: Record<CitedSourceType, string> = {
  reddit_thread: "Reddit thread",
  linkedin_post: "LinkedIn post",
  youtube_video: "YouTube video",
  wikipedia: "Wikipedia",
  news_article: "News article",
  au_directory: "AU directory",
  brand_owned: "Brand-owned",
  review_site: "Review site",
  industry_association: "Industry body",
  government_regulator: "Regulator / government",
  // Task #46 follow-up: "Unclassified" (not "Other") is already the
  // gap-severity badge's own label for this source type
  // (components/domain/trust/source-gap-card.tsx's GAP_CONFIG) --
  // using the same word here would render it twice on one card.
  other: "Other",
};

/**
 * Accepts a bare `string` (not `CitedSourceType`) because the value
 * reaching display code has usually round-tripped through JSON (an API
 * response, a DB row) and lost its narrowed type by then. Falls back to
 * a plain underscore-replace for any value that isn't a recognised
 * CitedSourceType -- e.g. the separate NO_CITATIONS_SOURCE_TYPE
 * sentinel (lib/trust/citation-intelligence.ts), which is never meant
 * to reach this map.
 */
export function sourceTypeLabel(sourceType: string): string {
  return (
    (SOURCE_TYPE_LABELS as Record<string, string | undefined>)[sourceType] ??
    sourceType.replace(/_/g, " ")
  );
}
