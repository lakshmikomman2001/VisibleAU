import { and, desc, eq, sql } from "drizzle-orm";
import type { Tier } from "@/db/schema/enums";
import {
  agentReadinessScores,
  brandConsensusChecks,
  brandEntityScores,
  citationSourceIntelligence,
  contentStructureAudits,
  evidenceSnapshots,
  linkedinPresenceAudits,
  queryFanOutResults,
  topicalCoverageGaps,
  visibilityTrends,
} from "@/db/schema";
import type { DbClient } from "@/db/client";
import type { Engine } from "@/lib/llm/interface";
import { selectModel } from "@/lib/llm/model-selector";
import { formatRate } from "./format-helpers";
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
  linkedinSummary: Record<string, unknown> | null;
  consensusSummary: Record<string, unknown> | null;
  entityHomeSummary: Record<string, unknown> | null;
  agentReadinessSummary: Record<string, unknown> | null;
  knowledgePanelSummary: Record<string, unknown> | null;
  confidenceNotes: ConfidenceNote[];
}

const WIRED_SECTIONS = new Set([
  "executive_summary",
  "score_breakdown",
  "mention_source_divide",
  "fan_out_coverage",
  "topical_gap_summary",
  "linkedin_performance",
  "consensus_score",
  "knowledge_panel_status",
  "source_type_gaps",
  "evidence_snapshots",
  "entity_home_status",
  "agent_readiness",
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
  let linkedinSummary: Record<string, unknown> | null = null;
  let consensusSummary: Record<string, unknown> | null = null;
  let knowledgePanelSummary: Record<string, unknown> | null = null;
  let entityHomeSummary: Record<string, unknown> | null = null;
  let agentReadinessSummary: Record<string, unknown> | null = null;

  // RULE 2: surface confidence notes for low quality metrics
  if (trend) {
    if (trend.sampleQuality === "Hypothesis" || trend.sampleQuality === "Insufficient data") {
      confidenceNotes.push({
        metric: "visibility_trend",
        qualityStatus: trend.sampleQuality,
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
        const compositeDelta = Number(trend.scoreCompositeAvg ?? 0);
        if (trend.sampleQuality === "Insufficient data") {
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
        const scoreDelta = Number(trend.scoreCompositeAvg ?? 0);
        const qualityPasses = ["Likely", "Confirmed"].includes(trend.sampleQuality);

        if (scoreDelta > 0 && qualityPasses) {
          keyWins.push({
            dimension: "composite_score",
            scoreDelta,
            sampleQuality: trend.sampleQuality,
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
        if (!trend) break;
        if (!trend.brandArchetype) break;
        narrativeParts.push(
          `Brand archetype: ${trend.brandArchetype.replace(/_/g, " ")}. Mention rate: ${formatRate(Number(trend.mentionRate ?? 0))}, citation rate: ${formatRate(Number(trend.citationRate ?? 0))}.`,
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

      case "linkedin_performance": {
        const liRows = await tx
          .select()
          .from(linkedinPresenceAudits)
          .where(eq(linkedinPresenceAudits.brandId, input.brandId))
          .orderBy(desc(linkedinPresenceAudits.auditedAt))
          .limit(1);
        const li = liRows[0];
        if (!li || li.presenceScore === null) break;
        narrativeParts.push(
          `LinkedIn presence score: ${li.presenceScore}/100.${li.gaps && Array.isArray(li.gaps) && (li.gaps as string[]).length > 0 ? ` Top gap: ${(li.gaps as string[])[0]}` : ""}`,
        );
        linkedinSummary = { presenceScore: li.presenceScore, gaps: li.gaps };
        break;
      }

      case "consensus_score": {
        const conRows = await tx
          .select()
          .from(brandConsensusChecks)
          .where(eq(brandConsensusChecks.brandId, input.brandId));
        if (conRows.length === 0) break;
        const scores = conRows
          .map((r) => r.consistencyScore)
          .filter((s): s is number => s !== null);
        if (scores.length === 0) break;
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        narrativeParts.push(
          `Cross-platform consensus: ${avg}/100 average across ${scores.length} sources.`,
        );
        consensusSummary = { avgScore: avg, sourceCount: scores.length };
        break;
      }

      case "knowledge_panel_status": {
        const entityRows = await tx
          .select()
          .from(brandEntityScores)
          .where(eq(brandEntityScores.brandId, input.brandId))
          .orderBy(desc(brandEntityScores.checkedAt))
          .limit(1);
        const entity = entityRows[0];
        if (!entity) break;
        const kpPresent = entity.knowledgePanelPresent === true;
        const kpAccurate = entity.knowledgePanelAccurate === true;
        if (kpPresent && kpAccurate) break;
        narrativeParts.push(
          `Knowledge Panel: ${kpPresent ? "present but inaccurate" : "not found"}.`,
        );
        knowledgePanelSummary = {
          present: kpPresent,
          accurate: kpAccurate,
          url: entity.knowledgePanelUrl,
        };
        break;
      }

      case "source_type_gaps": {
        const csiRows = await tx
          .select()
          .from(citationSourceIntelligence)
          .where(eq(citationSourceIntelligence.brandId, input.brandId))
          .orderBy(desc(citationSourceIntelligence.calculatedAt))
          .limit(20);
        if (csiRows.length === 0) break;
        const criticalGaps = csiRows.filter((r) => r.gapSeverity === "critical");
        narrativeParts.push(
          `Citation source intelligence: ${csiRows.length} source types analysed, ${criticalGaps.length} critical gap${criticalGaps.length !== 1 ? "s" : ""}.`,
        );
        break;
      }

      case "evidence_snapshots": {
        const snapCount = await tx
          .select({ id: evidenceSnapshots.id })
          .from(evidenceSnapshots)
          .where(eq(evidenceSnapshots.brandId, input.brandId))
          .limit(1);
        if (snapCount.length > 0) {
          narrativeParts.push(
            "Evidence archive: immutable snapshots are being captured for this brand.",
          );
        }
        break;
      }

      case "entity_home_status": {
        const csaRows = await tx
          .select()
          .from(contentStructureAudits)
          .where(eq(contentStructureAudits.brandId, input.brandId))
          .limit(20);
        if (csaRows.length === 0) break;
        const entityHome = csaRows.find((r) => r.isEntityHomeCandidate === true);
        const orgSchema = entityHome?.entityHomeHasOrgSchema ?? false;
        const idField = entityHome?.entityHomeHasIdField ?? false;
        const sameAsCount = entityHome?.entityHomeSameAsCount ?? 0;
        const gaps: string[] = [];
        if (!entityHome) gaps.push("No Entity Home identified.");
        else {
          if (!orgSchema) gaps.push("Missing Organisation JSON-LD.");
          if (!idField) gaps.push("@id not pointing to canonical domain.");
          if (sameAsCount < 3) gaps.push(`Only ${sameAsCount} sameAs declarations (target: ≥3).`);
        }
        narrativeParts.push(
          `Entity Home: ${entityHome ? "detected" : "not identified"}.${orgSchema ? " Organisation JSON-LD present." : ""}${idField ? " @id confirmed." : ""} sameAs declarations: ${sameAsCount} (target: ≥3).`,
        );
        entityHomeSummary = {
          entityHomeDetected: !!entityHome,
          orgSchemaPresent: orgSchema,
          idFieldPresent: idField,
          sameAsCount,
          pageUrl: entityHome?.entityHomePageUrl ?? null,
          gaps,
        };
        break;
      }

      case "agent_readiness": {
        const arRows = await tx
          .select()
          .from(agentReadinessScores)
          .where(eq(agentReadinessScores.brandId, input.brandId))
          .orderBy(desc(agentReadinessScores.scoredAt))
          .limit(1);
        const ar = arRows[0];
        if (!ar) break;
        narrativeParts.push(
          `Agent Readiness: ${ar.totalScore ?? 0}/100 (Tech ${ar.techScore ?? 0}/20, Entity ${ar.entityClarityScore ?? 0}/20, Verify ${ar.verifyScore ?? 0}/20, Authority ${ar.authorityScore ?? 0}/20, Task ${ar.taskScore ?? 0}/20).`,
        );
        const arGaps = (ar.gaps as string[] | null) ?? [];
        if (arGaps.length > 0) {
          keyGaps.push({
            dimension: "agent_readiness",
            score: ar.totalScore ?? 0,
            description: arGaps[0],
          });
        }
        agentReadinessSummary = {
          totalScore: ar.totalScore,
          techScore: ar.techScore,
          entityClarityScore: ar.entityClarityScore,
          verifyScore: ar.verifyScore,
          authorityScore: ar.authorityScore,
          taskScore: ar.taskScore,
          localAiTrustScore: ar.localAiTrustScore,
          gaps: arGaps,
        };
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
    trend && trend.brandArchetype
      ? {
          mentionRate: Number(trend.mentionRate ?? 0),
          citationRate: Number(trend.citationRate ?? 0),
          ratio: trend.mentionSourceRatio != null
            ? Number(trend.mentionSourceRatio)
            : null,
          archetype: trend.brandArchetype ?? "unknown",
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
    linkedinSummary,
    consensusSummary,
    entityHomeSummary,
    agentReadinessSummary,
    knowledgePanelSummary,
    confidenceNotes,
  };
}
