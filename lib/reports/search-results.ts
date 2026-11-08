import { isBrandDomain } from "@/lib/audit/extract-citations";

/**
 * Mock-gate and retention follow-ups (9 Nov), part 6 -- audit #42's action "Make your services easy for AI to
 * match" stated a cause the audit never measured. The one cause the stored data can show: whether the brand's own
 * site was among Claude's web-search results. Claude's search results are stored with each answer
 * (citations.cited_sources; an uncited one is { url, cited: false }, lib/llm/web-search-config.ts
 * anthropicAnswerSources), so for every answer that kept them we know whether the site was there.
 *
 * Counted only over answers that kept at least one uncited result: that's what proves the search results, not
 * just the citations, were stored. Null when none did -- then no reason is stated.
 */
export interface SearchResultsSeen {
  /** Everyday answers whose search results were stored. */
  answers: number;
  /** Of those, the ones with the brand's own site among the results, cited or not. */
  withYourSite: number;
}

type StoredSource = string | { url?: unknown; domain?: unknown; cited?: unknown };

export function searchResultsSeen(
  rows: ReadonlyArray<{ citedSources: unknown }>,
  brandDomain: string | null | undefined,
): SearchResultsSeen | null {
  let answers = 0;
  let withYourSite = 0;
  for (const row of rows) {
    const sources = Array.isArray(row.citedSources) ? (row.citedSources as StoredSource[]) : [];
    const keptSearchResults = sources.some((s) => typeof s === "object" && s?.cited === false);
    if (!keptSearchResults) continue;
    answers++;
    const yours = sources.some((s) => {
      if (typeof s === "string") return isBrandDomain(s, brandDomain);
      const where = [s?.domain, s?.url].filter((v): v is string => typeof v === "string");
      return where.some((w) => isBrandDomain(w, brandDomain));
    });
    if (yours) withYourSite++;
  }
  return answers > 0 ? { answers, withYourSite } : null;
}
