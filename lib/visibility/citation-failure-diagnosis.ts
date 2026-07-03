import { and, eq, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { topicalCoverageGaps } from "@/db/schema";
import type { CitationDiagnosis } from "./types";

interface DiagnoseInput {
  brandId: string;
  auditId?: string;
  promptId?: string;
}

async function tableExists(
  tx: DbClient,
  tableName: string,
): Promise<boolean> {
  const result = await tx.execute(
    sql`SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS exists`,
  );
  const row = (result as unknown as Array<{ exists?: boolean }>)?.[0];
  return row?.exists === true;
}

export async function diagnose(
  tx: DbClient,
  input: DiagnoseInput,
): Promise<CitationDiagnosis[]> {
  const { brandId } = input;
  const diagnoses: CitationDiagnosis[] = [];

  const gaps = await tx
    .select()
    .from(topicalCoverageGaps)
    .where(
      and(
        eq(topicalCoverageGaps.brandId, brandId),
        eq(topicalCoverageGaps.brandHasContent, false),
      ),
    )
    .orderBy(sql`${topicalCoverageGaps.crossPromptImpact} DESC NULLS LAST`)
    .limit(10);

  for (const gap of gaps) {
    const topCompetitor = Array.isArray(gap.competitorCoverage)
      ? (gap.competitorCoverage as Array<{ domain: string; depth: number }>).sort(
          (a, b) => b.depth - a.depth,
        )[0]
      : undefined;

    diagnoses.push({
      patternKey: "missing_topic_coverage",
      severity:
        gap.crossPromptImpact && gap.crossPromptImpact >= 3
          ? "high"
          : gap.crossPromptImpact && gap.crossPromptImpact >= 2
            ? "medium"
            : "low",
      evidence: `No content found for topic "${gap.topicLabel}" in ${gap.vertical}. ${
        gap.crossPromptImpact
          ? `Fixing this could improve ${gap.crossPromptImpact} prompts.`
          : ""
      }`,
      competitorCited: topCompetitor?.domain,
      topicCluster: gap.topicCluster,
      remediation: `Create authoritative content covering "${gap.topicLabel}" to increase citation likelihood.`,
    });
  }

  // CPR-01: citation_source_intelligence (Sprint 5) — degrade gracefully when absent
  const hasSourceIntel = await tableExists(tx, "citation_source_intelligence");
  if (hasSourceIntel) {
    const sourceRows = await tx.execute(
      sql`SELECT source_type, COUNT(*) as cnt
          FROM citation_source_intelligence
          WHERE brand_id = ${brandId}
          GROUP BY source_type
          ORDER BY cnt DESC
          LIMIT 5`,
    );
    for (const row of sourceRows as unknown as Array<{
      source_type: string;
      cnt: string;
    }>) {
      if (row.source_type === "brand_owned" && Number(row.cnt) === 0) {
        diagnoses.push({
          patternKey: "no_brand_owned_citations",
          severity: "high",
          evidence:
            "AI engines are not citing your own website. Competitors or third-party sources are cited instead.",
          remediation:
            "Improve schema markup, FAQ pages, and structured data so AI engines prefer your domain as a primary source.",
        });
      }
    }
  }

  // CPR-01: comparison_prompt_results (Sprint 7) — degrade gracefully when absent
  const hasComparison = await tableExists(tx, "comparison_prompt_results");
  if (hasComparison) {
    const compRows = await tx.execute(
      sql`SELECT competitor_domain, COUNT(*) as cited_count
          FROM comparison_prompt_results
          WHERE brand_id = ${brandId} AND competitor_cited = true
          GROUP BY competitor_domain
          ORDER BY cited_count DESC
          LIMIT 3`,
    );
    for (const row of compRows as unknown as Array<{
      competitor_domain: string;
      cited_count: string;
    }>) {
      diagnoses.push({
        patternKey: "competitor_cited_instead",
        severity: "medium",
        evidence: `${row.competitor_domain} is cited ${row.cited_count} times in prompts where your brand is absent.`,
        competitorCited: row.competitor_domain,
        remediation: `Analyze what content ${row.competitor_domain} has that earns citations, then create competing content.`,
      });
    }
  }

  diagnoses.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return diagnoses;
}
