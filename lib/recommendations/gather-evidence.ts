import { and, eq, gte } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { contentStructureAudits } from "@/db/schema";
import {
  type AuDirectoryResult,
  checkAuDirectories,
} from "@/lib/brand-entity/au-directory-aggregate";
import { checkWikipediaAuStatus, type WikipediaAuStatus } from "@/lib/brand-entity/wikipedia-au";
import { classifyFreshness } from "@/lib/retrieval/content-auditor";
import type {
  CheckOutcome,
  DatedPage,
  DirectoryEvidence,
  PageFreshnessEvidence,
  RecommendationEvidence,
  WikipediaEvidence,
} from "./evidence";

/**
 * Runs every real checker the recommendation rules depend on, for one
 * brand, BEFORE recommendations are built.
 *
 * Design choice (vs. a separate background step): the checkers run inline
 * at audit completion, but OUTSIDE the DB transaction that inserts
 * action_items -- the directory checks (8s timeout each, run in parallel)
 * and the Wikipedia search (10s) must never hold a transaction open. Each
 * checker is independently time-boxed and can only ever produce
 * "unavailable", never throw, so a slow or failing directory site
 * downgrades one recommendation's confidence instead of crashing
 * recommendation generation. The result is plain JSON, so the Inngest
 * path runs it as its own retryable step.run.
 */

export interface CrawledPageRow {
  pageUrl: string;
  lastModified: string | null;
}

export interface EvidenceCheckers {
  checkAuDirectories: (brandName: string) => Promise<AuDirectoryResult>;
  checkWikipediaAuStatus: (brandName: string) => Promise<WikipediaAuStatus>;
  /** Pages from the brand's most recent Content Structure Audit crawl. */
  loadCrawledPages: (brandId: string) => Promise<CrawledPageRow[]>;
}

export interface GatherEvidenceInput {
  brandId: string;
  brandName: string;
}

/** Overall per-checker budget, above the checkers' own fetch timeouts. */
export const CHECKER_TIMEOUT_MS = 15_000;
/** The Content Structure Audit cron runs weekly; older crawls aren't
 * "this audit's" evidence. */
export const CRAWL_MAX_AGE_DAYS = 45;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function safely<T>(
  run: () => Promise<CheckOutcome<T>>,
  timeoutMs: number,
): Promise<CheckOutcome<T>> {
  try {
    return await withTimeout(run(), timeoutMs);
  } catch (err) {
    return { status: "unavailable", reason: err instanceof Error ? err.message : "check failed" };
  }
}

export function defaultCrawledPagesLoader(dbClient: DbClient, now: Date = new Date()) {
  return async (brandId: string): Promise<CrawledPageRow[]> => {
    const since = new Date(now.getTime() - CRAWL_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    return dbClient
      .select({
        pageUrl: contentStructureAudits.pageUrl,
        lastModified: contentStructureAudits.lastModified,
      })
      .from(contentStructureAudits)
      .where(
        and(
          eq(contentStructureAudits.brandId, brandId),
          gte(contentStructureAudits.auditedAt, since),
        ),
      );
  };
}

/** Pure: turns crawled rows into freshness evidence. Only a row with a
 * real, parseable last_modified counts as dated -- a missing date is an
 * unknown age, never "stale". */
export function toPageFreshness(
  rows: CrawledPageRow[],
  now: Date = new Date(),
): CheckOutcome<PageFreshnessEvidence> {
  if (rows.length === 0) {
    return { status: "unavailable", reason: "no recent content crawl for this brand" };
  }
  const datedPages: DatedPage[] = [];
  let undatedPageCount = 0;
  for (const row of rows) {
    const d = row.lastModified ? new Date(row.lastModified) : null;
    if (!d || Number.isNaN(d.getTime())) {
      undatedPageCount++;
      continue;
    }
    const { daysSincePublished, freshnessRisk } = classifyFreshness(d, now);
    datedPages.push({
      url: row.pageUrl,
      lastModified: d.toISOString(),
      daysSinceModified: daysSincePublished,
      freshnessRisk,
    });
  }
  return { status: "ok", data: { datedPages, undatedPageCount } };
}

export async function gatherRecommendationEvidence(
  input: GatherEvidenceInput,
  checkers: EvidenceCheckers,
  options: { timeoutMs?: number; now?: Date } = {},
): Promise<RecommendationEvidence> {
  const timeoutMs = options.timeoutMs ?? CHECKER_TIMEOUT_MS;
  const now = options.now ?? new Date();

  const [directories, wikipedia, pageFreshness] = await Promise.all([
    safely<DirectoryEvidence>(async () => {
      const r = await checkers.checkAuDirectories(input.brandName);
      if (r.auDirectoryPresence.length === 0) {
        return { status: "unavailable", reason: "directory check returned no results" };
      }
      return {
        status: "ok",
        data: {
          results: r.auDirectoryPresence.map((d) => ({
            name: d.name,
            status: d.status,
            url: d.url,
            finding: d.finding,
          })),
        },
      };
    }, timeoutMs),
    safely<WikipediaEvidence>(async () => {
      const r = await checkers.checkWikipediaAuStatus(input.brandName);
      if (r.status === "unavailable") return { status: "unavailable", reason: r.reason };
      return {
        status: "ok",
        data: {
          articleExists: r.status === "found",
          articleUrl: r.status === "found" ? r.url : null,
          query: r.query,
        },
      };
    }, timeoutMs),
    safely<PageFreshnessEvidence>(
      async () => toPageFreshness(await checkers.loadCrawledPages(input.brandId), now),
      timeoutMs,
    ),
  ]);

  return {
    directories,
    wikipedia,
    // No real press/notability checker exists in this codebase (see the
    // WP:NCORP comment in ./triggers.ts), so this is honestly "not_run".
    notability: { status: "not_run" },
    pageFreshness,
  };
}

/** The production checker set: real network checks + a DB read of the
 * Content Structure Audit crawl. */
export function productionCheckers(dbClient: DbClient): EvidenceCheckers {
  return {
    checkAuDirectories,
    checkWikipediaAuStatus,
    loadCrawledPages: defaultCrawledPagesLoader(dbClient),
  };
}
