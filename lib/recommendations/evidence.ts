import type { FreshnessRisk } from "@/lib/retrieval/content-auditor";

/**
 * Brand-specific evidence the recommendation engine checks its claims
 * against. Every field is plain JSON (no Dates, no class instances) so it
 * survives an Inngest step.run boundary unchanged.
 *
 * Each checker resolves to one of three outcomes, and the rules treat them
 * differently -- that difference IS the confidence system:
 *   "ok"          -- the checker ran; `data` is what it actually found.
 *   "unavailable" -- it tried and failed (network error, timeout, no
 *                    recent crawl data). Never treated as a negative.
 *   "not_run"     -- no checker exists / it wasn't invoked (e.g. a unit
 *                    test, or the notability signal, which has no real
 *                    checker in this codebase yet).
 */
export type CheckOutcome<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable"; reason: string }
  | { status: "not_run" };

/**
 * Vunnara (21 Oct, "directory listings... never scraping", Part E) --
 * replaces the deleted live-fetch checker's DirectoryFinding/
 * DirectoryEvidence shape. Real evidence now has two independent
 * sources, both real for THIS brand and THIS audit: `citedCount`/
 * `totalAnswers`/`citedUrls`/`ownerProfileCited` come from Part D's
 * read-time citation count (lib/directories/citation-counts.ts);
 * `ownerStatus`/`ownerConfirmedAt` come from the owner's own
 * confirmation (brand_directory_listings, Part C). Never both empty at
 * once by construction -- a finding only exists in `findings` when
 * citedCount > 0 (see gather-evidence.ts), so there's always at least a
 * real citation count behind it, whether or not the owner has also
 * confirmed anything for that directory.
 */
export interface DirectoryVisibilityFinding {
  key: string;
  name: string;
  citedCount: number;
  totalAnswers: number;
  /** Up to 10 real, DISTINCT cited pages, for evidence_refs -- never a
   * resolved Gemini grounding redirect (citation-counts.ts's own
   * guard), never the same page twice under two different tracking
   * params (Part D polish). */
  citedUrls: Array<{ url: string; displayUrl: string }>;
  /** True only when one of citedUrls is host+path-identical to the
   * owner's own confirmed "listed" profile. */
  ownerProfileCited: boolean;
  ownerStatus: "listed" | "not_listed" | "unsure" | null;
  /** ISO-8601, set only when ownerStatus is non-null. */
  ownerConfirmedAt: string | null;
}

export interface DirectoryVisibilityEvidence {
  /** ISO-8601, when Part D's citation count was computed -- the
   * "computed timestamp" directory-visibility's measured_citations
   * evidence refs cite (lib/recommendations/triggers.ts). */
  computedAt: string;
  /** Only directories this audit's organic/run-1 answers actually
   * cited (citedCount > 0) -- a directory nothing cited has nothing
   * for this rule to say about it. */
  findings: DirectoryVisibilityFinding[];
}

export interface WikipediaEvidence {
  /** true: an article for the brand exists. false: the search ran and
   * found none. (An errored search is "unavailable", never false.) */
  articleExists: boolean;
  articleUrl: string | null;
  query: string;
}

/**
 * Wikipedia's company-notability guideline (WP:NCORP) needs significant,
 * independent, reliable, secondary coverage from MULTIPLE sources, at
 * least one of them regional/statewide/national/international (see the
 * comment on the wikipedia-article rule in ./triggers.ts). `scope` is the
 * outlet's audience, which is what that "at least one non-local" test
 * reads.
 */
export interface NotabilitySource {
  url: string;
  outlet: string;
  scope: "local" | "regional" | "national" | "international";
}

export interface NotabilityEvidence {
  qualifyingSources: NotabilitySource[];
}

export interface DatedPage {
  url: string;
  /** ISO-8601, from the page's real HTTP Last-Modified header. */
  lastModified: string;
  daysSinceModified: number;
  freshnessRisk: FreshnessRisk;
}

export interface PageFreshnessEvidence {
  /** Pages from the brand's recent Content Structure Audit crawl that
   * carried a real Last-Modified date. */
  datedPages: DatedPage[];
  /** Crawled pages with no usable date -- unknown age, never "stale". */
  undatedPageCount: number;
}

export interface RecommendationEvidence {
  directories: CheckOutcome<DirectoryVisibilityEvidence>;
  wikipedia: CheckOutcome<WikipediaEvidence>;
  notability: CheckOutcome<NotabilityEvidence>;
  pageFreshness: CheckOutcome<PageFreshnessEvidence>;
}

export const NO_EVIDENCE: RecommendationEvidence = {
  directories: { status: "not_run" },
  wikipedia: { status: "not_run" },
  notability: { status: "not_run" },
  pageFreshness: { status: "not_run" },
};
