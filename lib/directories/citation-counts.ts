import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brandDirectoryListings, citations } from "@/db/schema";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { type DirectoryEntry, findDirectoryByDomain, getDirectoriesForBrand } from "./registry";

/**
 * Vunnara (21 Oct, "directory listings... never scraping", Part D) --
 * Gemini's google_search grounding returns an opaque
 * vertexaisearch.cloud.google.com/grounding-api-redirect/... URL as the
 * "source" (lib/llm/web-search-config.ts's extractCitedUrls takes
 * whatever AI SDK source.url the provider gives, unchanged), never the
 * real target site -- following it would be a live network fetch at
 * read time, which this function must never do. Nothing this product
 * stores today carries the resolved destination separately (confirmed:
 * lib/audit/extract-citations.ts's mergeCitedSources derives `domain`
 * straight from `new URL(url).hostname`, so a Gemini grounding entry's
 * stored domain IS the redirect host). Every citedSources entry shaped
 * like this is therefore unresolvable -- skipped before any directory
 * match is attempted, never counted as if the redirect host itself were
 * a cited domain. If a future write-time change ever stores the real
 * resolved domain alongside it, this is the one place to start reading
 * that instead of skipping.
 */
const GOOGLE_GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

function isUnresolvableGeminiRedirect(domain: string): boolean {
  return domain === GOOGLE_GROUNDING_REDIRECT_HOST;
}

interface CitedSourceEntry {
  domain?: unknown;
  url?: unknown;
}

function safeParseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Host (minus www) + path (minus trailing slash) equality -- the same
 * "is this literally the owner's profile page" test Part C's PUT route
 * uses the registry's profileUrlPattern for at write time; this is the
 * read-time match against a cited URL. */
function sameProfilePage(a: URL, b: URL): boolean {
  const hostA = a.hostname.toLowerCase().replace(/^www\./, "");
  const hostB = b.hostname.toLowerCase().replace(/^www\./, "");
  const pathA = a.pathname.replace(/\/+$/, "");
  const pathB = b.pathname.replace(/\/+$/, "");
  return hostA === hostB && pathA === pathB;
}

export interface DirectoryCitationResult {
  directory: DirectoryEntry;
  /** Organic/run-1 answers this audit produced that cited this
   * directory's domain (counted once per answer, however many times
   * that answer cited it). */
  citedCount: number;
  totalAnswers: number;
  /** Up to 10 real cited URLs for this directory, for linking -- never
   * a resolved Gemini redirect (see this file's top comment). */
  citedUrls: string[];
  /** Whether any cited URL for this directory is the owner's own
   * confirmed profile (host+path match against brand_directory_listings,
   * Part C) -- only ever true when the owner's status is "listed" AND a
   * cited URL actually matches it. */
  ownerProfileCited: boolean;
  /** The owner's own confirmed status for this directory (Part C), or
   * null when they've never confirmed anything for it. */
  ownerStatus: "listed" | "not_listed" | "unsure" | null;
  ownerConfirmedAt: string | null;
}

export interface AuditDirectoryCitations {
  /** This audit's organic, run_number = 1 answer count. No separate
   * "successful" filter is needed: a failed engine call writes no
   * citations row at all (lib/audit/run-audit-inline.ts's own comment,
   * "a failed call writes no citation row"), so every row counted here
   * already represents a successful answer. */
  totalAnswers: number;
  computedAt: string;
  results: DirectoryCitationResult[];
}

interface BrandForCitationCounts {
  id: string;
  region: string;
  categories: readonly string[];
}

/**
 * Part D: per audit, read-time, how many of this audit's organic/run-1
 * answers cite each of this brand's relevant registry directories
 * (lib/directories/registry.ts), and whether any cited URL is the
 * owner's own confirmed profile. Exactly two queries, regardless of how
 * many directories or answers exist -- never one per directory, never
 * one per answer; the per-directory counting itself is one in-process
 * pass over the already-fetched citation rows.
 *
 * `tx` must already be RLS-scoped to this brand's organization (e.g.
 * via withRlsContext) -- same contract as
 * lib/scoring/resolve-audit-dimensions.ts's resolveOrganicDimensions,
 * which this function's citations query mirrors exactly (ORGANIC_ONLY,
 * run_number = 1). citations carries no organization_id of its own
 * (only audit_id); brand_directory_listings is FORCE RLS, enforced by
 * the scoped `tx` itself.
 */
export async function getDirectoryCitationsForAudit(
  tx: DbClient,
  auditId: string,
  brand: BrandForCitationCounts,
  now: Date = new Date(),
): Promise<AuditDirectoryCitations> {
  const computedAt = now.toISOString();
  const relevant = getDirectoriesForBrand(brand.region, brand.categories);
  if (relevant.length === 0) {
    return { totalAnswers: 0, computedAt, results: [] };
  }
  const relevantKeys = new Set(relevant.map((d) => d.key));

  const [rows, confirmedRows] = await Promise.all([
    tx
      .select({ citedSources: citations.citedSources })
      .from(citations)
      .where(and(eq(citations.auditId, auditId), ORGANIC_ONLY, eq(citations.runNumber, 1))),
    tx
      .select({
        directoryKey: brandDirectoryListings.directoryKey,
        status: brandDirectoryListings.status,
        profileUrl: brandDirectoryListings.profileUrl,
        confirmedAt: brandDirectoryListings.confirmedAt,
      })
      .from(brandDirectoryListings)
      .where(eq(brandDirectoryListings.brandId, brand.id)),
  ]);

  const totalAnswers = rows.length;
  const confirmedByKey = new Map(confirmedRows.map((r) => [r.directoryKey, r]));

  const buckets = new Map<
    string,
    { directory: DirectoryEntry; citedCount: number; citedUrls: string[]; ownerProfileCited: boolean }
  >();
  for (const directory of relevant) {
    buckets.set(directory.key, { directory, citedCount: 0, citedUrls: [], ownerProfileCited: false });
  }

  for (const row of rows) {
    const entries = Array.isArray(row.citedSources) ? (row.citedSources as CitedSourceEntry[]) : [];
    const citedKeysThisRow = new Set<string>();

    for (const entry of entries) {
      const domain = typeof entry.domain === "string" ? entry.domain : null;
      const url = typeof entry.url === "string" ? entry.url : null;
      if (!domain || !url || isUnresolvableGeminiRedirect(domain)) continue;

      const directory = findDirectoryByDomain(domain);
      if (!directory || !relevantKeys.has(directory.key)) continue;
      const bucket = buckets.get(directory.key);
      if (!bucket) continue;

      citedKeysThisRow.add(directory.key);
      if (bucket.citedUrls.length < 10) bucket.citedUrls.push(url);

      const confirmed = confirmedByKey.get(directory.key);
      if (!bucket.ownerProfileCited && confirmed?.status === "listed" && confirmed.profileUrl) {
        const ownUrl = safeParseUrl(confirmed.profileUrl);
        const citedUrl = safeParseUrl(url);
        if (ownUrl && citedUrl && sameProfilePage(ownUrl, citedUrl)) {
          bucket.ownerProfileCited = true;
        }
      }
    }

    for (const key of citedKeysThisRow) {
      const bucket = buckets.get(key);
      if (bucket) bucket.citedCount++;
    }
  }

  const results: DirectoryCitationResult[] = relevant.map((directory) => {
    const bucket = buckets.get(directory.key);
    const confirmed = confirmedByKey.get(directory.key);
    return {
      directory,
      citedCount: bucket?.citedCount ?? 0,
      totalAnswers,
      citedUrls: bucket?.citedUrls ?? [],
      ownerProfileCited: bucket?.ownerProfileCited ?? false,
      ownerStatus: confirmed?.status ?? null,
      ownerConfirmedAt: confirmed?.confirmedAt ? confirmed.confirmedAt.toISOString() : null,
    };
  });

  return { totalAnswers, computedAt, results };
}
