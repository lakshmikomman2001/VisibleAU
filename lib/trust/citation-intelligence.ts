import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citationSourceIntelligence, citations } from "@/db/schema";
import { SOURCE_AFFINITY_NOTES } from "@/db/seed/citation-source-affinity";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";

export type GapSeverity = "critical" | "warning" | "opportunity" | "covered";

export function computeGapSeverity(citationShare: number, brandPresent: boolean): GapSeverity {
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
}

/**
 * Task #41: the 5th surface of the lib/llm/cache.ts 48h replay bug
 * (#23/#24/#36/#39/#40) -- auditCitations had no run_number filter, so
 * every card's count included the ~4 byte-identical cache-replay rows
 * per (engine, prompt). run_number = 1 is the one real call; see
 * docs/ops/post-launch-db-hardening.md section 41.
 */
export async function buildCitationSourceIntelligence(
  tx: DbClient,
  auditId: string,
  brandId: string,
  organizationId: string,
): Promise<SourceIntelligenceResult[]> {
  const auditCitations = await tx
    .select()
    .from(citations)
    .where(and(eq(citations.auditId, auditId), ORGANIC_ONLY, eq(citations.runNumber, 1)));

  const totalByEngine: Record<string, number> = {};
  const groupedByEngineSource: Record<string, { count: number; brandPresent: boolean }> = {};

  for (const cit of auditCitations) {
    const engine = cit.engine;
    const sourceType = cit.citedSourceType ?? "other";
    const key = `${engine}::${sourceType}`;

    totalByEngine[engine] = (totalByEngine[engine] ?? 0) + 1;
    if (!groupedByEngineSource[key]) {
      groupedByEngineSource[key] = { count: 0, brandPresent: false };
    }
    groupedByEngineSource[key].count++;
    if (cit.brandMentioned) {
      groupedByEngineSource[key].brandPresent = true;
    }
  }

  const results: SourceIntelligenceResult[] = [];

  for (const [key, group] of Object.entries(groupedByEngineSource)) {
    const [engine, sourceType] = key.split("::");
    const total = totalByEngine[engine] ?? 1;
    const share = Math.round((group.count / total) * 100 * 100) / 100;
    const gapSeverity = computeGapSeverity(share, group.brandPresent);
    const affinityNote = SOURCE_AFFINITY_NOTES[sourceType] ?? null;

    // Per-audit row: kept as-is (narrative-generator.ts and
    // local-ai-trust-scorer.ts both still read these historically) --
    // this is unchanged write behaviour, just now on a deduped count.
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

    // Task #41: the aggregate slot the schema already reserved
    // (csi_unique_aggregate on (brand_id, engine, source_type) WHERE
    // audit_id IS NULL) but nothing ever wrote to -- one rolling
    // "current" row per (engine, sourceType), replaced by each new
    // audit's own numbers (latest-audit, not a multi-audit window: the
    // simplest honest "current" view). This is what the GET route reads
    // going forward, so the per-audit accumulation wall stops appearing
    // to the user without needing to touch the historical per-audit rows.
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

    results.push({
      sourceType,
      engine,
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
}

const SOURCE_ROW_COLUMNS = {
  id: citationSourceIntelligence.id,
  engine: citationSourceIntelligence.engine,
  sourceType: citationSourceIntelligence.sourceType,
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

  if (aggregateRows.length > 0) return aggregateRows;

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

  return tx
    .select(SOURCE_ROW_COLUMNS)
    .from(citationSourceIntelligence)
    .where(
      and(
        eq(citationSourceIntelligence.brandId, brandId),
        eq(citationSourceIntelligence.auditId, latest.auditId),
      ),
    );
}
