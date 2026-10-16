import type { DirectoryStatus } from "@/lib/brand-entity/au-directory-aggregate";
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

export interface DirectoryFinding {
  name: string;
  status: DirectoryStatus;
  /** The directory page that confirmed a listing (only set when listed). */
  url: string | null;
  finding: string;
}

export interface DirectoryEvidence {
  results: DirectoryFinding[];
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
  directories: CheckOutcome<DirectoryEvidence>;
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
