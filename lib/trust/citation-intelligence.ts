import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { boolean, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { DbClient } from "@/db/client";
import { audits, brands, citationSourceIntelligence, citations } from "@/db/schema";
import { SOURCE_AFFINITY_NOTES } from "@/db/seed/citation-source-affinity";
import {
  type CitationOrigin,
  resolveCitationOrigin,
  toDisplayDomain,
  toRegistrableDomain,
} from "@/lib/audit/extract-citations";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import type { Engine } from "@/lib/llm/interface";
import { classifyCitedSources } from "@/lib/visibility/citation-source-classifier";

/**
 * Task #45 follow-up: Drizzle's single-row `.insert(table).values({})`
 * always emits EVERY column the table object declares, using `default`
 * for any key the caller didn't provide -- omitting a key from the JS
 * object does NOT omit that column from the generated SQL (confirmed
 * via `.toSQL()`: `.values({ a: "x" })` on a table with columns
 * (id, a, b) produces `insert into t (id, a, b) values (default, $1,
 * default)`, identical to passing `b: undefined` explicitly). So the
 * "retry without topDomains" fallback below CANNOT just omit the key
 * on the real `citationSourceIntelligence` table object -- Drizzle
 * would still reference "top_domains" in the generated SQL and the
 * retry would throw the exact same 42703 as the first attempt. This
 * second table descriptor, scoped to this file only (deliberately NOT
 * under db/schema/, so drizzle-kit generate never sees it as a second
 * "citation_source_intelligence" table), has every column the real one
 * does EXCEPT top_domains, so inserting through IT never mentions that
 * column at all. Used only by the two fallback branches below. See
 * docs/ops/post-launch-db-hardening.md section 45.
 */
const citationSourceIntelligenceNoTopDomains = pgTable("citation_source_intelligence", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").notNull(),
  organizationId: uuid("organization_id").notNull(),
  auditId: uuid("audit_id"),
  engine: text("engine").notNull(),
  sourceType: text("source_type").notNull(),
  citationCount: integer("citation_count").notNull(),
  citationShare: numeric("citation_share", { precision: 5, scale: 2 }),
  brandPresentInSource: boolean("brand_present_in_source").notNull(),
  gapSeverity: text("gap_severity").notNull(),
  sourceAffinityNote: text("source_affinity_note"),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
  // Task #45 follow-up: the registrable domain of the brand's own
  // domain, computed once -- used ONLY for the top_domains "this
  // brand" badge below, a stricter check than classifyCitedSources'
  // own brand_owned classification (see isBrandDomain comment below).
  const brandRegistrableDomain = brandDomain ? toRegistrableDomain(brandDomain) : null;

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
      let rawDomain: string;
      try {
        rawDomain = entry?.domain ?? new URL(source.url).hostname.replace(/^www\./, "");
      } catch {
        console.debug("[citation-intelligence] dropped citation with unparseable URL (non-fatal)", {
          auditId,
          engine,
          url: source.url,
        });
        return;
      }

      // Task #46: count integrity. A citedSources entry whose host
      // doesn't resolve to a real ICANN registrable domain at all (a
      // text-extraction false positive, or a hallucinated URL's host)
      // no longer counts toward citationCount or the per-engine share
      // denominator -- previously it fell back to the raw lowercased
      // host and was tallied anyway, which is exactly how a card ended
      // up claiming e.g. "5 citations" with only 0-3 real domains
      // behind it. Skipping here (not calling tally at all) means a
      // group whose every entry fails this never gets created in the
      // first place -- the card simply doesn't render, satisfying
      // "cards with 0 valid entries are not rendered" without any
      // separate suppression step. See
      // docs/ops/post-launch-db-hardening.md section 46.
      const registrableDomain = toRegistrableDomain(rawDomain);
      if (registrableDomain === null) {
        console.debug("[citation-intelligence] dropped citation with no valid registrable domain (non-fatal)", {
          auditId,
          engine,
          rawDomain,
        });
        return;
      }
      // Task #46 Part D: gov.au/edu.au group/display by the full
      // hostname (different departments/institutions matter
      // separately for this product) -- every other domain keeps the
      // registrable-domain grouping. Validity (above) and the brand
      // comparison (below) both stay on the registrable domain
      // regardless -- only the TopDomainEntry's display key changes.
      const displayDomain = toDisplayDomain(rawDomain) ?? registrableDomain;
      const origin = resolveCitationOrigin(entry ?? {}, engine);
      // brandPresent (the card's "Covered" signal): either the response
      // that cited this source also mentioned the brand, OR this
      // specific source IS the brand's own domain per the classifier's
      // own (substring-of-URL) "brand_owned" call -- unchanged from
      // task #43/#44.
      const isBrandSourceType = source.sourceType === "brand_owned";
      // isBrandDomain (the top_domains "this brand" badge): a stronger,
      // user-visible claim than category bucketing, so it's an exact
      // registrable-domain-to-registrable-domain comparison, not a
      // substring-of-URL check. classifySourceTypeWithBrand's
      // `url.includes(brandDomain)` also matches a cited URL that merely
      // CONTAINS the brand's domain string without actually being it
      // (e.g. a hallucinated "bondiplumbing.com.au.evil-tracker.com") --
      // fine for the broader category bucket, too weak a claim for a
      // badge that visually asserts "this domain IS the brand's own".
      const isBrandDomain =
        brandRegistrableDomain !== null && registrableDomain === brandRegistrableDomain;
      tally(engine, source.sourceType, cit.brandMentioned || isBrandSourceType, {
        domain: displayDomain,
        origin,
        isBrand: isBrandDomain,
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
  // Task #46 follow-up: collected here and written in ONE replace-set
  // operation AFTER this loop (below) instead of a per-group upsert --
  // a category that existed in a previous audit but has no group in
  // THIS one must disappear from the rolling aggregate, not linger
  // with stale numbers forever. See
  // docs/ops/post-launch-db-hardening.md section 46 (aggregate
  // replace-set follow-up).
  const aggregateRowValues: Array<{
    engine: string;
    sourceType: string;
    citationCount: number;
    citationShare: string;
    brandPresentInSource: boolean;
    gapSeverity: GapSeverity;
    sourceAffinityNote: string | null;
    topDomains: TopDomainEntry[];
  }> = [];

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
    //
    // Task #45 follow-up: each attempt is wrapped in its own
    // tx.transaction() -- a SAVEPOINT when `tx` is already an active
    // transaction, or a fresh standalone transaction when it's a plain
    // client (today's only two real callers: serviceDb from the Inngest
    // function, and the plain db client in the integration tests --
    // neither is itself an open transaction, so this is a no-op change
    // for them). In Postgres, ANY failed statement poisons the
    // enclosing transaction until ROLLBACK -- so without this, a future
    // caller that DOES pass an active transaction (the `DbClient` type
    // already allows it) would see the retry-without-topDomains attempt
    // ALSO fail (with "current transaction is aborted", not 42703),
    // and the whole outer transaction -- including unrelated writes
    // made before or after this call -- would silently roll back on its
    // final commit, even though this function itself never threw. A
    // savepoint confines a failed attempt to just that attempt. See
    // docs/ops/post-launch-db-hardening.md section 45.
    try {
      await tx.transaction(async (sp) => {
        await sp
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
      });
    } catch (err) {
      console.error("[citation-intelligence] per-audit insert with topDomains failed, retrying without it (non-fatal)", {
        brandId,
        auditId,
        engine,
        sourceType,
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        await tx.transaction(async (sp) => {
          await sp
            .insert(citationSourceIntelligenceNoTopDomains)
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
        });
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

    // Task #46 follow-up: the aggregate write moved out of this
    // per-group loop -- see the single replace-set operation after the
    // loop, below. Collected here, in the exact shape that step needs.
    aggregateRowValues.push({
      engine,
      sourceType,
      citationCount: group.count,
      citationShare: String(share),
      brandPresentInSource: group.brandPresent,
      gapSeverity,
      sourceAffinityNote: affinityNote,
      topDomains,
    });

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

  // Task #41: the aggregate slot the schema already reserved
  // (csi_unique_aggregate on (brand_id, engine, source_type) WHERE
  // audit_id IS NULL) but nothing ever wrote to -- one rolling
  // "current" view per (engine, sourceType), replaced by each new
  // audit's own numbers. This is what the GET route reads going
  // forward, so the per-audit accumulation wall stops appearing to the
  // user without needing to touch the historical per-audit rows. See
  // docs/ops/post-launch-db-hardening.md section 41/42.
  //
  // Task #46 follow-up: §41/§45's per-group UPSERT never removed a
  // category that existed in a PREVIOUS audit but has no group in
  // THIS one -- its aggregate row just sat there untouched, forever,
  // even after the brand's real current state had moved on (the live
  // case: Bondi's Gemini "other" -- 5 citations, 0 domains -- from an
  // earlier audit kept rendering after a re-audit fixed the underlying
  // extraction, because nothing ever told its aggregate row to go
  // away). This is now a REPLACE, not a merge: every one of the
  // brand's aggregate rows is deleted, then the brand's full current
  // set (aggregateRowValues, built above -- possibly empty) is
  // inserted, inside ONE savepoint so a reader can never observe the
  // table mid-replace (empty because the delete ran but the insert
  // hasn't, or missing new categories because only some of the insert
  // landed). If the insert fails for any reason, the whole savepoint
  // -- including the delete -- rolls back automatically, so the
  // aggregate keeps its previous complete set rather than ending up
  // half-replaced. An empty aggregateRowValues (this audit found zero
  // valid groups brand-wide) correctly empties the aggregate for this
  // brand -- the screen shows its honest "no citation data yet"
  // empty state, not a stale previous audit's numbers (see
  // getCurrentCitationSources' Part B companion fix).
  //
  // Task #45: same topDomains-missing-column fallback as the per-audit
  // insert -- retried without it before giving up entirely. Since
  // DELETE never references top_domains, only the INSERT half of a
  // retry can fail on it; redoing the DELETE on retry is harmless (the
  // first attempt's delete was already rolled back by its own failed
  // savepoint).
  //
  // Task #45 follow-up: each attempt is its own tx.transaction() --
  // a SAVEPOINT when `tx` is already an active transaction.
  try {
    await tx.transaction(async (sp) => {
      await sp
        .delete(citationSourceIntelligence)
        .where(
          and(eq(citationSourceIntelligence.brandId, brandId), isNull(citationSourceIntelligence.auditId)),
        );
      if (aggregateRowValues.length > 0) {
        await sp.insert(citationSourceIntelligence).values(
          aggregateRowValues.map((r) => ({
            brandId,
            organizationId,
            auditId: null,
            engine: r.engine,
            sourceType: r.sourceType,
            citationCount: r.citationCount,
            citationShare: r.citationShare,
            brandPresentInSource: r.brandPresentInSource,
            gapSeverity: r.gapSeverity,
            sourceAffinityNote: r.sourceAffinityNote,
            topDomains: r.topDomains,
          })),
        );
      }
    });
  } catch (err) {
    console.error("[citation-intelligence] aggregate replace with topDomains failed, retrying without it (non-fatal)", {
      brandId,
      auditId,
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      await tx.transaction(async (sp) => {
        await sp
          .delete(citationSourceIntelligenceNoTopDomains)
          .where(
            and(
              eq(citationSourceIntelligenceNoTopDomains.brandId, brandId),
              isNull(citationSourceIntelligenceNoTopDomains.auditId),
            ),
          );
        if (aggregateRowValues.length > 0) {
          await sp.insert(citationSourceIntelligenceNoTopDomains).values(
            aggregateRowValues.map((r) => ({
              brandId,
              organizationId,
              auditId: null,
              engine: r.engine,
              sourceType: r.sourceType,
              citationCount: r.citationCount,
              citationShare: r.citationShare,
              brandPresentInSource: r.brandPresentInSource,
              gapSeverity: r.gapSeverity,
              sourceAffinityNote: r.sourceAffinityNote,
            })),
          );
        }
      });
    } catch (err2) {
      console.error("[citation-intelligence] aggregate replace failed (non-fatal) -- aggregate retains its previous complete set", {
        brandId,
        auditId,
        error: err2 instanceof Error ? err2.message : String(err2),
      });
    }
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

  // Task #46 follow-up: the aggregate is now ALWAYS replaced on every
  // buildCitationSourceIntelligence call (including replacing it to
  // EMPTY when the latest audit found zero valid groups brand-wide --
  // see the replace-set step there). So an empty `aggregateRows` above
  // is ambiguous: it could mean "this brand has never been audited
  // under the aggregate-writing pipeline at all" (§41's original
  // reason for this fallback existing) OR "the brand's actual latest
  // completed audit found nothing, and genuinely wrote nothing
  // anywhere, aggregate included." Those need different answers -- the
  // first should fall back to these historical per-audit rows (§41's
  // original behaviour); the second must NOT, or the screen shows an
  // older audit's numbers as if they were current, exactly the
  // overstatement task #46 exists to fix. Resolved without a migration
  // by cross-checking the real `audits` table: if a LATER audit has
  // completed than the one these per-audit rows belong to, that later
  // audit wrote nothing at all anywhere (otherwise either its own
  // per-audit rows or a fresh aggregate replace would already have
  // been visible above) -- meaning it genuinely found zero valid
  // groups, and the honest answer is the empty state, not these
  // older rows.
  const [latestCompletedAudit] = await tx
    .select({ id: audits.id })
    .from(audits)
    .where(and(eq(audits.brandId, brandId), eq(audits.status, "complete")))
    .orderBy(desc(audits.completedAt))
    .limit(1);

  if (latestCompletedAudit && latestCompletedAudit.id !== latest.auditId) {
    return [];
  }

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
