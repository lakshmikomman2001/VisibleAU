import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brands, citationSourceIntelligence, citations } from "@/db/schema";
import { SOURCE_AFFINITY_NOTES } from "@/db/seed/citation-source-affinity";
import { type CitationOrigin, resolveCitationOrigin, toRegistrableDomain } from "@/lib/audit/extract-citations";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import type { Engine } from "@/lib/llm/interface";
import { classifyCitedSources } from "@/lib/visibility/citation-source-classifier";

/**
 * Task #45: up to 8 domains per (engine, sourceType) card, sorted by
 * citation count desc -- the "Unclassified" bucket's actual sites
 * (likely competitor businesses) are the most useful thing it was
 * hiding. `origin` rolls up to "retrieved" if ANY occurrence of this
 * domain in the group came from a provider's structured citations
 * (the stronger claim), else "recalled". See
 * docs/ops/post-launch-db-hardening.md section 45.
 */
export interface TopDomainEntry {
  domain: string;
  count: number;
  origin: CitationOrigin;
  isBrand?: true;
}

const MAX_TOP_DOMAINS = 8;

/**
 * Task #43: "unclassified" is a distinct state from the four severity
 * levels below -- "other" means the classifier couldn't categorise the
 * cited source(s) at all, which isn't an actionable gap in a specific
 * channel the way critical/warning/opportunity are. Kept separate from
 * computeGapSeverity's pure share+brandPresent logic (unchanged, still
 * independently testable) -- the "other" -> "unclassified" override is
 * applied by the one caller that knows the sourceType
 * (buildCitationSourceIntelligence). See
 * docs/ops/post-launch-db-hardening.md section 43.
 */
export type GapSeverity = "critical" | "warning" | "opportunity" | "covered" | "unclassified";

export function computeGapSeverity(
  citationShare: number,
  brandPresent: boolean,
): Exclude<GapSeverity, "unclassified"> {
  if (brandPresent) return "covered";
  if (citationShare > 20) return "critical";
  if (citationShare >= 10) return "warning";
  return "opportunity";
}

export interface SourceIntelligenceResult {
  sourceType: string;
  engine: string;
  citationCount: number;
  citationShare: number;
  brandPresentInSource: boolean;
  gapSeverity: GapSeverity;
  sourceAffinityNote: string | null;
  topDomains: TopDomainEntry[];
}

/**
 * Task #41: the 5th surface of the lib/llm/cache.ts 48h replay bug
 * (#23/#24/#36/#39/#40) -- auditCitations had no run_number filter, so
 * every card's count included the ~4 byte-identical cache-replay rows
 * per (engine, prompt). run_number = 1 is the one real call; see
 * docs/ops/post-launch-db-hardening.md section 41.
 *
 * Task #43: classify-citation-sources.ts only ever wrote ONE
 * citedSourceType per citations row (classified[0], the first-extracted
 * source) -- "Citations: N" on the screen actually counted responses,
 * not cited sources, and a response naming five different sites
 * collapsed to a single category. This now re-classifies EVERY URL in
 * each response's citedSources jsonb array (which already stores all of
 * them) at aggregation time via classifyCitedSources -- a deliberate
 * no-migration choice (re-running classification here rather than
 * persisting a new per-URL column on citations). citedSourceType itself
 * is untouched for narrative-generator.ts/render-report-pdf.ts/
 * local-ai-trust-scorer.ts's existing per-audit reads. See
 * docs/ops/post-launch-db-hardening.md section 43.
 */
export async function buildCitationSourceIntelligence(
  tx: DbClient,
  auditId: string,
  brandId: string,
  organizationId: string,
): Promise<SourceIntelligenceResult[]> {
  const [brand] = await tx.select({ domain: brands.domain }).from(brands).where(eq(brands.id, brandId));
  const brandDomain = brand?.domain ?? "";

  const auditCitations = await tx
    .select()
    .from(citations)
    .where(and(eq(citations.auditId, auditId), ORGANIC_ONLY, eq(citations.runNumber, 1)));

  interface DomainTally {
    count: number;
    origin: CitationOrigin;
    isBrand: boolean;
  }
  interface GroupAccumulator {
    count: number;
    brandPresent: boolean;
    domains: Map<string, DomainTally>;
  }

  const totalByEngine: Record<string, number> = {};
  const groupedByEngineSource: Record<string, GroupAccumulator> = {};

  function tally(
    engine: string,
    sourceType: string,
    brandPresent: boolean,
    domainInfo?: { domain: string; origin: CitationOrigin; isBrand: boolean },
  ) {
    const key = `${engine}::${sourceType}`;
    totalByEngine[engine] = (totalByEngine[engine] ?? 0) + 1;
    groupedByEngineSource[key] ??= { count: 0, brandPresent: false, domains: new Map() };
    const group = groupedByEngineSource[key];
    group.count++;
    if (brandPresent) group.brandPresent = true;

    if (domainInfo) {
      const existing = group.domains.get(domainInfo.domain);
      if (existing) {
        existing.count++;
        if (domainInfo.origin === "retrieved") existing.origin = "retrieved";
        if (domainInfo.isBrand) existing.isBrand = true;
      } else {
        group.domains.set(domainInfo.domain, {
          count: 1,
          origin: domainInfo.origin,
          isBrand: domainInfo.isBrand,
        });
      }
    }
  }

  for (const cit of auditCitations) {
    const engine = cit.engine as Engine;
    const citedSources = Array.isArray(cit.citedSources)
      ? (cit.citedSources as Array<{ url: string; domain?: string; origin?: CitationOrigin }>)
      : [];

    if (citedSources.length === 0) {
      // No source extracted/returned for this response at all -- still
      // counts as one "other" source so a real organic response is
      // never silently dropped from the totals.
      tally(engine, "other", cit.brandMentioned);
      continue;
    }

    const classified = classifyCitedSources(citedSources, brandDomain);
    classified.forEach((source, i) => {
      const entry = citedSources[i];
      const rawDomain = entry?.domain ?? new URL(source.url).hostname.replace(/^www\./, "");
      const registrableDomain = toRegistrableDomain(rawDomain);
      const origin = resolveCitationOrigin(entry ?? {}, engine);
      const isBrand = source.sourceType === "brand_owned";
      // brandPresent: either the response that cited this source also
      // mentioned the brand (the original per-response signal), OR this
      // specific source IS the brand's own domain (classified
      // "brand_owned") -- either is a real, measured presence signal.
      tally(engine, source.sourceType, cit.brandMentioned || isBrand, {
        domain: registrableDomain,
        origin,
        isBrand,
      });
    });
  }

  function buildTopDomains(domains: Map<string, DomainTally>): TopDomainEntry[] {
    return [...domains.entries()]
      .map(([domain, info]): TopDomainEntry => ({
        domain,
        count: info.count,
        origin: info.origin,
        ...(info.isBrand ? { isBrand: true as const } : {}),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_TOP_DOMAINS);
  }

  const results: SourceIntelligenceResult[] = [];

  for (const [key, group] of Object.entries(groupedByEngineSource)) {
    const [engine, sourceType] = key.split("::");
    const total = totalByEngine[engine] ?? 1;
    const share = Math.round((group.count / total) * 100 * 100) / 100;
    // Task #43: "other" is an unclassified bucket, not an actionable
    // gap in a specific channel -- never badge it on the same
    // Covered/Warning/Critical/Opportunity scale as a real category.
    // Still counted in `total` above (share isn't artificially inflated
    // for the real categories by excluding it).
    const gapSeverity: GapSeverity =
      sourceType === "other" ? "unclassified" : computeGapSeverity(share, group.brandPresent);
    const affinityNote = SOURCE_AFFINITY_NOTES[sourceType] ?? null;
    const topDomains = buildTopDomains(group.domains);

    // Per-audit row: kept as-is (narrative-generator.ts and
    // local-ai-trust-scorer.ts both still read these historically) --
    // this is unchanged write behaviour, just now on a deduped count.
    //
    // Task #45: topDomains is a new column (migration 0039) that may not
    // exist yet wherever this runs. Try with it first; if the insert
    // fails, retry WITHOUT the topDomains key at all (not just a null
    // value for it -- referencing a genuinely missing column in the SQL
    // at all throws 42703 regardless of the value) so the core row
    // (count/share/severity, unaffected by this column) still gets
    // written. See docs/ops/post-launch-db-hardening.md section 45.
    try {
      await tx
        .insert(citationSourceIntelligence)
        .values({
          brandId,
          organizationId,
          auditId,
          engine,
          sourceType,
          citationCount: group.count,
          citationShare: String(share),
          brandPresentInSource: group.brandPresent,
          gapSeverity,
          sourceAffinityNote: affinityNote,
          topDomains,
        })
        .onConflictDoNothing();
    } catch (err) {
      console.error("[citation-intelligence] per-audit insert with topDomains failed, retrying without it (non-fatal)", {
        brandId,
        auditId,
        engine,
        sourceType,
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        await tx
          .insert(citationSourceIntelligence)
          .values({
            brandId,
            organizationId,
            auditId,
            engine,
            sourceType,
            citationCount: group.count,
            citationShare: String(share),
            brandPresentInSource: group.brandPresent,
            gapSeverity,
            sourceAffinityNote: affinityNote,
          })
          .onConflictDoNothing();
      } catch (err2) {
        console.error("[citation-intelligence] per-audit insert failed even without topDomains (non-fatal)", {
          brandId,
          auditId,
          engine,
          sourceType,
          error: err2 instanceof Error ? err2.message : String(err2),
        });
      }
    }

    // Task #41: the aggregate slot the schema already reserved
    // (csi_unique_aggregate on (brand_id, engine, source_type) WHERE
    // audit_id IS NULL) but nothing ever wrote to -- one rolling
    // "current" row per (engine, sourceType), replaced by each new
    // audit's own numbers (latest-audit, not a multi-audit window: the
    // simplest honest "current" view). This is what the GET route reads
    // going forward, so the per-audit accumulation wall stops appearing
    // to the user without needing to touch the historical per-audit rows.
    //
    // Task #41 Part C: wrapped separately from the per-audit insert
    // above and made non-fatal. onConflictDoUpdate's targetWhere only
    // succeeds if a matching partial unique index actually exists in
    // whatever database this runs against -- this repo's migration
    // history for 0012-0033 (which includes the migration defining this
    // index) was never directly confirmed applied to prod this session.
    // The aggregate row is a display optimisation, not the source of
    // truth: getCurrentCitationSources already falls back to the latest
    // audit's per-audit rows (written above, unaffected by this
    // try/catch) when no aggregate row exists. An audit must never fail
    // because this one write couldn't complete. See
    // docs/ops/post-launch-db-hardening.md section 41/42.
    //
    // Task #45: same topDomains-missing-column fallback as the per-audit
    // insert above, nested inside the existing aggregate-upsert guard --
    // these are two independently-missing schema objects (the
    // csi_unique_aggregate index vs. the top_domains column), so a
    // retry-without-topDomains is attempted before giving up on the
    // aggregate row entirely.
    try {
      await tx
        .insert(citationSourceIntelligence)
        .values({
          brandId,
          organizationId,
          auditId: null,
          engine,
          sourceType,
          citationCount: group.count,
          citationShare: String(share),
          brandPresentInSource: group.brandPresent,
          gapSeverity,
          sourceAffinityNote: affinityNote,
          topDomains,
        })
        .onConflictDoUpdate({
          target: [
            citationSourceIntelligence.brandId,
            citationSourceIntelligence.engine,
            citationSourceIntelligence.sourceType,
          ],
          targetWhere: sql`audit_id IS NULL`,
          set: {
            citationCount: group.count,
            citationShare: String(share),
            brandPresentInSource: group.brandPresent,
            gapSeverity,
            sourceAffinityNote: affinityNote,
            topDomains,
            calculatedAt: new Date(),
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      console.error("[citation-intelligence] aggregate upsert with topDomains failed, retrying without it (non-fatal)", {
        brandId,
        auditId,
        engine,
        sourceType,
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        await tx
          .insert(citationSourceIntelligence)
          .values({
            brandId,
            organizationId,
            auditId: null,
            engine,
            sourceType,
            citationCount: group.count,
            citationShare: String(share),
            brandPresentInSource: group.brandPresent,
            gapSeverity,
            sourceAffinityNote: affinityNote,
          })
          .onConflictDoUpdate({
            target: [
              citationSourceIntelligence.brandId,
              citationSourceIntelligence.engine,
              citationSourceIntelligence.sourceType,
            ],
            targetWhere: sql`audit_id IS NULL`,
            set: {
              citationCount: group.count,
              citationShare: String(share),
              brandPresentInSource: group.brandPresent,
              gapSeverity,
              sourceAffinityNote: affinityNote,
              calculatedAt: new Date(),
              updatedAt: new Date(),
            },
          });
      } catch (err2) {
        console.error("[citation-intelligence] aggregate upsert failed (non-fatal)", {
          brandId,
          auditId,
          engine,
          sourceType,
          error: err2 instanceof Error ? err2.message : String(err2),
        });
      }
    }

    results.push({
      sourceType,
      engine,
      topDomains,
      citationCount: group.count,
      citationShare: share,
      brandPresentInSource: group.brandPresent,
      gapSeverity,
      sourceAffinityNote: affinityNote,
    });
  }

  return results;
}

export interface StoredSourceRow {
  id: string;
  engine: string;
  sourceType: string;
  citationCount: number;
  citationShare: string | null;
  brandPresentInSource: boolean;
  gapSeverity: string;
  sourceAffinityNote: string | null;
  // Task #45: null for rows written before migration 0039 (or whose
  // non-fatal write fell back to omitting it) -- the UI renders a
  // "appears after the next audit" fallback for those, never an
  // empty/broken list.
  topDomains: TopDomainEntry[] | null;
}

const SOURCE_ROW_COLUMNS = {
  id: citationSourceIntelligence.id,
  engine: citationSourceIntelligence.engine,
  sourceType: citationSourceIntelligence.sourceType,
  topDomains: citationSourceIntelligence.topDomains,
  citationCount: citationSourceIntelligence.citationCount,
  citationShare: citationSourceIntelligence.citationShare,
  brandPresentInSource: citationSourceIntelligence.brandPresentInSource,
  gapSeverity: citationSourceIntelligence.gapSeverity,
  sourceAffinityNote: citationSourceIntelligence.sourceAffinityNote,
};

/**
 * Task #41: one card per (engine, sourceType) instead of the
 * accumulated per-audit pile. Reads the aggregate rows
 * (auditId IS NULL, written by buildCitationSourceIntelligence above)
 * if any audit has completed under this code; otherwise -- so the
 * screen never regresses to the old duplication wall OR goes empty
 * immediately after deploy, before any brand's next audit has run --
 * falls back to the single most-recent historical audit's own row set,
 * not the full cross-audit pile. Note: a row that fell back this way
 * still carries whatever count (pre-run_number-filter) and
 * classification (pre-widened-classifier) its audit was built with --
 * full accuracy follows that brand's next audit. See
 * docs/ops/post-launch-db-hardening.md section 41.
 */
/** Task #45: jsonb columns come back from Drizzle as `unknown` --
 * normalizes a raw topDomains value to the typed shape, treating
 * anything not a genuine array (including a row written before
 * migration 0039, which has no value here at all) as null rather than
 * guessing at malformed data. */
function normalizeTopDomains(value: unknown): TopDomainEntry[] | null {
  return Array.isArray(value) ? (value as TopDomainEntry[]) : null;
}

function toStoredSourceRow(row: {
  id: string;
  engine: string;
  sourceType: string;
  topDomains: unknown;
  citationCount: number;
  citationShare: string | null;
  brandPresentInSource: boolean;
  gapSeverity: string;
  sourceAffinityNote: string | null;
}): StoredSourceRow {
  return { ...row, topDomains: normalizeTopDomains(row.topDomains) };
}

export async function getCurrentCitationSources(
  tx: DbClient,
  brandId: string,
): Promise<StoredSourceRow[]> {
  const aggregateRows = await tx
    .select(SOURCE_ROW_COLUMNS)
    .from(citationSourceIntelligence)
    .where(
      and(
        eq(citationSourceIntelligence.brandId, brandId),
        isNull(citationSourceIntelligence.auditId),
      ),
    )
    .orderBy(desc(citationSourceIntelligence.calculatedAt))
    .limit(200);

  if (aggregateRows.length > 0) {
    return sortUnclassifiedLast(aggregateRows.map(toStoredSourceRow));
  }

  const [latest] = await tx
    .select({ auditId: citationSourceIntelligence.auditId })
    .from(citationSourceIntelligence)
    .where(
      and(
        eq(citationSourceIntelligence.brandId, brandId),
        isNotNull(citationSourceIntelligence.auditId),
      ),
    )
    .orderBy(desc(citationSourceIntelligence.calculatedAt))
    .limit(1);

  if (!latest?.auditId) return [];

  const fallbackRows = await tx
    .select(SOURCE_ROW_COLUMNS)
    .from(citationSourceIntelligence)
    .where(
      and(
        eq(citationSourceIntelligence.brandId, brandId),
        eq(citationSourceIntelligence.auditId, latest.auditId),
      ),
    );

  return sortUnclassifiedLast(fallbackRows.map(toStoredSourceRow));
}

/** Task #43: real, actionable categories read above the Unclassified
 * card -- "other" isn't a channel a customer can address, so it
 * shouldn't compete for the same visual priority as one that is. */
function sortUnclassifiedLast(rows: StoredSourceRow[]): StoredSourceRow[] {
  return [...rows].sort((a, b) => {
    const aUnclassified = a.gapSeverity === "unclassified" ? 1 : 0;
    const bUnclassified = b.gapSeverity === "unclassified" ? 1 : 0;
    return aUnclassified - bUnclassified;
  });
}
