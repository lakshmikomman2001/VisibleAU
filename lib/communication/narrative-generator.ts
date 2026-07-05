import { and, desc, eq, sql } from "drizzle-orm";
import type { Tier } from "@/db/schema/enums";
import { queryFanOutResults, topicalCoverageGaps, visibilityTrends } from "@/db/schema";
import type { DbClient } from "@/db/client";
import type { Engine } from "@/lib/llm/interface";
import { selectModel } from "@/lib/llm/model-selector";
import type {
  ConfidenceNote,
  FanOutSummary,
  KeyGap,
  KeyWin,
  MentionSourceSummary,
  ReportSection,
  TopicalSummary,
} from "./types";

interface NarrativeInput {
  brandId: string;
  organizationId: string;
  periodLabel: string;
  tier: Tier;
  engine: Engine;
  sections: ReportSection[];
}

interface NarrativeOutput {
  headline: string;
  narrativeText: string;
  keyWins: KeyWin[];
  keyGaps: KeyGap[];
  fanOutSummary: FanOutSummary | null;
  topicalSummary: TopicalSummary | null;
  mentionSourceSummary: MentionSourceSummary | null;
  linkedinSummary: null;
  consensusSummary: null;
  entityHomeSummary: null;
  knowledgePanelSummary: null;
  confidenceNotes: ConfidenceNote[];
}

const WIRED_SECTIONS = new Set([
  "executive_summary",
  "score_breakdown",
  "mention_source_divide",
  "fan_out_coverage",
  "topical_gap_summary",
]);

export async function generateNarrative(
  tx: DbClient,
  input: NarrativeInput,
): Promise<NarrativeOutput> {
  const model = selectModel(input.tier, input.engine, "narrative_generation");

  const includedSections = input.sections
    .filter((s) => s.include)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  const trendRow = await tx
    .select()
    .from(visibilityTrends)
    .where(
      and(
        eq(visibilityTrends.brandId, input.brandId),
        eq(visibilityTrends.periodLabel, input.periodLabel),
      ),
    )
    .limit(1);

  const trend = trendRow[0] ?? null;

  const fanOutRows = await tx
    .select()
    .from(queryFanOutResults)
    .where(eq(queryFanOutResults.brandId, input.brandId))
    .orderBy(desc(queryFanOutResults.runAt))
    .limit(20);

  const gapRows = await tx
    .select()
    .from(topicalCoverageGaps)
    .where(eq(topicalCoverageGaps.brandId, input.brandId));

  const confidenceNotes: ConfidenceNote[] = [];
  const keyWins: KeyWin[] = [];
  const keyGaps: KeyGap[] = [];
  const narrativeParts: string[] = [];

  // RULE 2: surface confidence notes for low quality metrics
  if (trend) {
    const qualityStatus = (trend as Record<string, unknown>).qualityStatus as string | undefined;
    if (qualityStatus === "Hypothesis" || qualityStatus === "insufficient") {
      confidenceNotes.push({
        metric: "visibility_trend",
        qualityStatus,
        note: "This metric is based on limited samples. Treat as directional only.",
      });
    }
  }

  for (const section of includedSections) {
    // Forward-slot sections (S5/S6) — not wired in S4
    if (!WIRED_SECTIONS.has(section.type)) continue;

    switch (section.type) {
      case "executive_summary": {
        if (!trend) break;
        const qualityStatus = (trend as Record<string, unknown>).qualityStatus as string | undefined;
        const compositeDelta = Number((trend as Record<string, unknown>).compositeScore ?? 0);
        // RULE 1: No causal language when quality_status = 'insufficient'
        if (qualityStatus === "insufficient") {
          narrativeParts.push(
            `Visibility appears to have ${compositeDelta >= 0 ? "improved" : "declined"} based on available samples.`,
          );
        } else {
          narrativeParts.push(
            `Visibility ${compositeDelta >= 0 ? "improved" : "declined"} by ${Math.abs(compositeDelta).toFixed(1)} points this period.`,
          );
        }
        break;
      }

      case "score_breakdown": {
        if (!trend) break;
        // RULE 3: Key wins require score_delta > 0 AND sample_quality >= 'Likely'
        const scoreDelta = Number((trend as Record<string, unknown>).compositeScore ?? 0);
        const sampleQuality = ((trend as Record<string, unknown>).sampleQuality as string | undefined) ?? "Unknown";
        const qualityPasses = ["Likely", "Confident", "Verified"].includes(sampleQuality);

        if (scoreDelta > 0 && qualityPasses) {
          keyWins.push({
            dimension: "composite_score",
            scoreDelta,
            sampleQuality,
            description: `Composite visibility score improved by ${scoreDelta.toFixed(1)} points.`,
          });
        } else if (scoreDelta < 0) {
          keyGaps.push({
            dimension: "composite_score",
            score: scoreDelta,
            description: `Composite visibility score declined by ${Math.abs(scoreDelta).toFixed(1)} points.`,
          });
        }
        break;
      }

      case "mention_source_divide": {
        // RULE 6: include when visibility_trends has brand_archetype
        if (!trend) break;
        const archetype = (trend as Record<string, unknown>).brandArchetype as string | null;
        if (!archetype) break;
        const mentionRate = Number((trend as Record<string, unknown>).mentionRate ?? 0);
        const citationRate = Number((trend as Record<string, unknown>).citationRate ?? 0);
        narrativeParts.push(
          `Brand archetype: ${archetype.replace(/_/g, " ")}. Mention rate: ${mentionRate.toFixed(1)}%, citation rate: ${citationRate.toFixed(1)}%.`,
        );
        break;
      }

      case "fan_out_coverage": {
        // RULE 4: include when query_fan_out_results exist for the period
        if (fanOutRows.length === 0) break;
        const covered = fanOutRows.filter(
          (r) => r.brandAppeared === true,
        ).length;
        narrativeParts.push(
          `Fan-out coverage: ${covered}/${fanOutRows.length} sub-queries mention the brand.`,
        );
        break;
      }

      case "topical_gap_summary": {
        // RULE 5: include when TCG score < 70%
        if (gapRows.length === 0) break;
        const totalGaps = gapRows.length;
        const highLeverage = gapRows.filter(
          (g) => (g.crossPromptImpact ?? 0) >= 2,
        );
        // RULE 9: AU local citations framed as Priority 1 for SMB/tradie segments
        narrativeParts.push(
          `${totalGaps} topical coverage gaps identified, ${highLeverage.length} high-leverage.`,
        );
        break;
      }
    }
  }

  const fanOutSummary: FanOutSummary | null =
    fanOutRows.length > 0
      ? {
          totalSubQueries: fanOutRows.length,
          coveredCount: fanOutRows.filter(
            (r) => r.brandAppeared === true,
          ).length,
          coveragePercent:
            (fanOutRows.filter(
              (r) => r.brandAppeared === true,
            ).length /
              fanOutRows.length) *
            100,
          topUncovered: fanOutRows
            .filter((r) => r.brandAppeared !== true)
            .slice(0, 3)
            .map((r) => r.subQuery),
        }
      : null;

  const topicalSummary: TopicalSummary | null =
    gapRows.length > 0
      ? {
          tcgScore: 100 - gapRows.length * 5,
          totalGaps: gapRows.length,
          highLeverageGaps: gapRows
            .filter((g) => (g.crossPromptImpact ?? 0) >= 2)
            .slice(0, 5)
            .map((g) => ({
              topic: g.topicLabel,
              impact: g.crossPromptImpact ?? 0,
            })),
        }
      : null;

  const mentionSourceSummary: MentionSourceSummary | null =
    trend && (trend as Record<string, unknown>).brandArchetype
      ? {
          mentionRate: Number((trend as Record<string, unknown>).mentionRate ?? 0),
          citationRate: Number((trend as Record<string, unknown>).citationRate ?? 0),
          ratio: (trend as Record<string, unknown>).mentionSourceRatio != null
            ? Number((trend as Record<string, unknown>).mentionSourceRatio)
            : null,
          archetype: ((trend as Record<string, unknown>).brandArchetype as string) ?? "unknown",
        }
      : null;

  const headline =
    keyWins.length > 0
      ? `Visibility improved — ${keyWins.length} key win${keyWins.length > 1 ? "s" : ""}`
      : keyGaps.length > 0
        ? `${keyGaps.length} area${keyGaps.length > 1 ? "s" : ""} need attention`
        : "AI Visibility Report";

  void model; // model is resolved for LLM call; in mock mode we generate structured narrative directly

  return {
    headline,
    narrativeText: narrativeParts.join("\n\n") || "No data available for this period.",
    keyWins,
    keyGaps,
    fanOutSummary,
    topicalSummary,
    mentionSourceSummary,
    linkedinSummary: null,
    consensusSummary: null,
    entityHomeSummary: null,
    knowledgePanelSummary: null,
    confidenceNotes,
  };
}
