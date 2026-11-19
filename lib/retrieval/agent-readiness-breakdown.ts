import { PRODUCT_NAME } from "@/lib/product";

/**
 * 17 Nov, part 3: an agent readiness score read back from its stored parts, with the parts nothing measured
 * taken out -- so a row the old writer stored (inngest/functions/score-agent-readiness.ts hard-coded page load
 * fast true, name consistent true, Wikipedia false, directories 0, review citations 0, expert quotes false,
 * citation rate 0 and citation diversity 0) shows what was really measured, not 6 free points and 22 points of
 * zeros nobody scored.
 *
 * Each dimension is scored out of the points that were measured ("8 of 16"), never out of 20 with the rest
 * counted as 0; `notMeasured` names the rest.
 */

export type ReadinessDimension = "tech" | "entity" | "verify" | "authority" | "task";

/** The stored row's parts (db/schema/agent-readiness-scores.ts), as the API returns them. */
export interface StoredReadinessParts {
  techLlmstxtPresent: boolean | null;
  techLlmstxtValid: boolean | null;
  techRobotsAllowsCrawlers: boolean | null;
  techSsrPasses: boolean | null;
  techAiDiscoveryEndpoints: boolean | null;
  techPageLoadFast: boolean | null;
  techMcpEndpointPresent: boolean | null;
  techMcpEndpointValid: boolean | null;
  entityOrgSchemaPresent: boolean | null;
  entityLocalBusinessSchema: boolean | null;
  entityLocalRegInSchema: boolean | null;
  entityNameConsistent: boolean | null;
  entityServiceReadable: boolean | null;
  verifyAbnConfirmed: boolean | null;
  verifyWikipediaAu: boolean | null;
  verifyAuDirectories: number | null;
  verifyReviewCitations: number | null;
  verifyExpertQuotes: boolean | null;
  authorityTopicalCoverage: number | null;
  authorityPromptAppearance: number | null;
  authorityCitationDiversity: number | null;
  taskBookingAccessible: boolean | null;
  taskPricingVisible: boolean | null;
  taskServiceAreaDefined: boolean | null;
  taskFaqDirectAnswers: number | null;
}

interface PartDef {
  dimension: ReadinessDimension;
  label: string;
  max: number;
  /** Points earned, or null when the part wasn't measured. */
  points: (row: StoredReadinessParts) => number | null;
  /** A part the old writer hard-coded: never measured on its rows, whatever it stored. */
  hardCodedBefore17Nov?: boolean;
  /** A part that needs the site to answer: not measured when the score run's crawl reached nothing. */
  needsSite?: boolean;
}

// A part a response left out reads like null: not measured.
const flag = (v: boolean | null | undefined, pts: number) =>
  v === null || v === undefined ? null : v ? pts : 0;
const count = (v: number | null | undefined, cap: number) =>
  v === null || v === undefined ? null : Math.min(v, cap);

/** One part: its dimension, the words the card uses, its points, and how its stored value scores. */
function part(
  dimension: ReadinessDimension,
  label: string,
  max: number,
  points: PartDef["points"],
  rules: { hardCodedBefore17Nov?: boolean; needsSite?: boolean } = {},
): PartDef {
  return { dimension, label, max, points, ...rules };
}

const OLD = { hardCodedBefore17Nov: true } as const;
const SITE = { needsSite: true } as const;

const PARTS: PartDef[] = [
  // Technical. 20 Nov: the two llms.txt draft parts (3 each) earn nothing, on every row: no AI provider has said its
  // engine reads llms.txt (lib/retrieval/agent-readiness.ts computeTechScore), so they're not parts of the score.
  part(
    "tech",
    "robots.txt lets GPTBot and ClaudeBot in",
    3,
    (r) => flag(r.techRobotsAllowsCrawlers, 3),
    SITE,
  ),
  part(
    "tech",
    "home page content in the server-rendered HTML",
    3,
    (r) => flag(r.techSsrPasses, 3),
    SITE,
  ),
  part("tech", "sitemap found", 2, (r) => flag(r.techAiDiscoveryEndpoints, 2), SITE),
  part("tech", "page load speed", 2, (r) => flag(r.techPageLoadFast, 2), OLD),
  part("tech", "MCP endpoint found", 2, (r) => flag(r.techMcpEndpointPresent, 2)),
  part("tech", "MCP endpoint valid", 2, (r) => flag(r.techMcpEndpointValid, 2)),
  // Entity clarity /20
  part(
    "entity",
    "Organisation schema on the entity home",
    5,
    (r) => flag(r.entityOrgSchemaPresent, 5),
    SITE,
  ),
  part("entity", "LocalBusiness schema", 4, (r) => flag(r.entityLocalBusinessSchema, 4), SITE),
  part("entity", "ABN in the schema", 4, (r) => flag(r.entityLocalRegInSchema, 4), SITE),
  part("entity", "name consistent across the web", 4, (r) => flag(r.entityNameConsistent, 4), OLD),
  part("entity", "a services page", 3, (r) => flag(r.entityServiceReadable, 3), SITE),
  // Verifiability /20
  part("verify", "ABN verified", 5, (r) => flag(r.verifyAbnConfirmed, 5)),
  part("verify", "Wikipedia AU page", 5, (r) => flag(r.verifyWikipediaAu, 5), OLD),
  part("verify", "AU directory listings", 4, (r) => count(r.verifyAuDirectories, 4), OLD),
  part("verify", "review citations", 3, (r) => count(r.verifyReviewCitations, 3), OLD),
  part("verify", "expert quotes", 3, (r) => flag(r.verifyExpertQuotes, 3), OLD),
  // Authority /20
  part(
    "authority",
    "pages found on the site",
    8,
    (r) =>
      r.authorityTopicalCoverage === null || r.authorityTopicalCoverage === undefined
        ? null
        : Math.round((r.authorityTopicalCoverage / 100) * 8),
    SITE,
  ),
  part(
    "authority",
    "how often AI answers cite you",
    6,
    (r) =>
      r.authorityPromptAppearance === null || r.authorityPromptAppearance === undefined
        ? null
        : Math.min(Math.round(r.authorityPromptAppearance * 6), 6),
    OLD,
  ),
  part("authority", "citation diversity", 6, (r) => count(r.authorityCitationDiversity, 6), OLD),
  // Task fit /20
  part("task", "online booking", 5, (r) => flag(r.taskBookingAccessible, 5), SITE),
  part("task", "visible pricing", 5, (r) => flag(r.taskPricingVisible, 5), SITE),
  part("task", "service area", 5, (r) => flag(r.taskServiceAreaDefined, 5), SITE),
  part("task", "question headings answered", 5, (r) => count(r.taskFaqDirectAnswers, 5), SITE),
];

/**
 * 20 Nov: what every part together is out of -- 94 since the two llms.txt draft parts (3 each) stopped counting; it was
 * 100. The card says "N of the 94 points weren't measured".
 */
export const READINESS_POINTS_TOTAL = PARTS.reduce((sum, p) => sum + p.max, 0);

/**
 * A row the old writer stored: it always wrote page load fast true, name consistent true, review citations 0,
 * expert quotes false, citation rate 0 and citation diversity 0. The writer from 17 Nov stores null for each.
 */
export function isPre17NovReadinessRow(row: StoredReadinessParts): boolean {
  return (
    row.techPageLoadFast === true &&
    row.entityNameConsistent === true &&
    row.verifyReviewCitations === 0 &&
    row.verifyExpertQuotes === false &&
    row.authorityPromptAppearance === 0 &&
    row.authorityCitationDiversity === 0
  );
}

/**
 * Whether the score run's crawl reached the site. The old writer stored "pages found" as min(pages x 5, 100), so 0
 * is a crawl that fetched nothing; the new one stores null for every page part then.
 */
function crawlReachedNothing(row: StoredReadinessParts, legacy: boolean): boolean {
  return legacy
    ? row.authorityTopicalCoverage === 0
    : row.authorityTopicalCoverage === null || row.authorityTopicalCoverage === undefined;
}

export interface ReadinessDimensionScore {
  points: number;
  /** The points this dimension's measured parts could earn (at most 20). */
  measuredMax: number;
}

export interface ReadinessBreakdown {
  dimensions: Record<ReadinessDimension, ReadinessDimensionScore>;
  total: ReadinessDimensionScore;
  notMeasured: Array<{ dimension: ReadinessDimension; label: string; points: number }>;
  /** false when the score run's crawl reached no page. */
  siteReached: boolean;
}

export function readinessFromStoredRow(row: StoredReadinessParts): ReadinessBreakdown {
  const legacy = isPre17NovReadinessRow(row);
  const nothingCrawled = crawlReachedNothing(row, legacy);
  const dims: ReadinessDimension[] = ["tech", "entity", "verify", "authority", "task"];
  const dimensions = Object.fromEntries(
    dims.map((d) => [d, { points: 0, measuredMax: 0 }]),
  ) as Record<ReadinessDimension, ReadinessDimensionScore>;
  const notMeasured: ReadinessBreakdown["notMeasured"] = [];

  for (const p of PARTS) {
    const unmeasuredByRule =
      (legacy && p.hardCodedBefore17Nov === true) || (nothingCrawled && p.needsSite === true);
    const pts = unmeasuredByRule ? null : p.points(row);
    if (pts === null) {
      notMeasured.push({ dimension: p.dimension, label: p.label, points: p.max });
      continue;
    }
    dimensions[p.dimension].points += pts;
    dimensions[p.dimension].measuredMax += p.max;
  }
  for (const d of dims) {
    dimensions[d].points = Math.min(dimensions[d].points, 20);
    dimensions[d].measuredMax = Math.min(dimensions[d].measuredMax, 20);
  }
  const total = dims.reduce(
    (sum, d) => ({
      points: sum.points + dimensions[d].points,
      measuredMax: sum.measuredMax + dimensions[d].measuredMax,
    }),
    { points: 0, measuredMax: 0 },
  );
  return { dimensions, total, notMeasured, siteReached: !nothingCrawled };
}

/**
 * The old writer's llms.txt gap said "No llms.txt file detected", but what it checked was whether we had
 * generated a draft -- not the site's own file. 20 Nov: neither is a gap any more -- llms.txt isn't scored, and no task
 * or gap implies an AI engine needs it. Stored rows keep them; the card leaves them out (readinessGapText: null).
 */
export const LEGACY_LLMSTXT_GAP = "No llms.txt file detected — generate and host one.";
export const LLMSTXT_DRAFT_GAP = `No llms.txt draft generated in ${PRODUCT_NAME} yet: generate one, then host it on your site.`;

/** The gap as the card shows it, or null for one it no longer shows (the llms.txt gaps). */
export function readinessGapText(gap: string): string | null {
  return gap === LEGACY_LLMSTXT_GAP || gap === LLMSTXT_DRAFT_GAP ? null : gap;
}

/** The gaps the card shows, in order. */
export function shownReadinessGaps(gaps: readonly string[]): string[] {
  return gaps.flatMap((gap) => {
    const text = readinessGapText(gap);
    return text === null ? [] : [text];
  });
}
