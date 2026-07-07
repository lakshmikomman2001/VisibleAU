import type { DbClient } from "@/db/client";
import { citationSourceIntelligence, citations } from "@/db/schema";
import { SOURCE_AFFINITY_NOTES } from "@/db/seed/citation-source-affinity";
import { eq, sql } from "drizzle-orm";

export type GapSeverity = "critical" | "warning" | "opportunity" | "covered";

export function computeGapSeverity(
  citationShare: number,
  brandPresent: boolean,
): GapSeverity {
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

export async function buildCitationSourceIntelligence(
  tx: DbClient,
  auditId: string,
  brandId: string,
  organizationId: string,
): Promise<SourceIntelligenceResult[]> {
  const auditCitations = await tx
    .select()
    .from(citations)
    .where(eq(citations.auditId, auditId));

  const totalByEngine: Record<string, number> = {};
  const groupedByEngineSource: Record<
    string,
    { count: number; brandPresent: boolean }
  > = {};

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
