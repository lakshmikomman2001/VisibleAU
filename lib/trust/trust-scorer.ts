import type { DbClient } from "@/db/client";
import {
  brandConsensusChecks,
  brandEntityScores,
  hallucinationIncidents,
  linkedinPresenceAudits,
  youtubePresenceAudits,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { computeHallucinationRisk } from "./hallucination-risk";

export interface TrustSummary {
  hallucinationRisk: number;
  entityScore: number;
  linkedinPresenceScore: number | null;
  consensusScore: number | null;
  youtubePresenceScore: number | null;
  overallTrustScore: number;
}

export async function computeTrustSummary(
  tx: DbClient,
  brandId: string,
): Promise<TrustSummary> {
  const [incidents, entityRows, linkedinRows, consensusRows, youtubeRows] =
    await Promise.all([
      tx
        .select({
          severity: hallucinationIncidents.severity,
          isFalsePositive: hallucinationIncidents.isFalsePositive,
        })
        .from(hallucinationIncidents)
        .where(eq(hallucinationIncidents.brandId, brandId)),
      tx
        .select({ scoreOf10: brandEntityScores.scoreOf10 })
        .from(brandEntityScores)
        .where(eq(brandEntityScores.brandId, brandId))
        .orderBy(desc(brandEntityScores.checkedAt))
        .limit(1),
      tx
        .select({ presenceScore: linkedinPresenceAudits.presenceScore })
        .from(linkedinPresenceAudits)
        .where(eq(linkedinPresenceAudits.brandId, brandId))
        .orderBy(desc(linkedinPresenceAudits.auditedAt))
        .limit(1),
      tx
        .select({ consistencyScore: brandConsensusChecks.consistencyScore })
        .from(brandConsensusChecks)
        .where(eq(brandConsensusChecks.brandId, brandId)),
      tx
        .select({ presenceScore: youtubePresenceAudits.presenceScore })
        .from(youtubePresenceAudits)
        .where(eq(youtubePresenceAudits.brandId, brandId))
        .orderBy(desc(youtubePresenceAudits.auditedAt))
        .limit(1),
    ]);

  const hallucinationRisk = computeHallucinationRisk(
    incidents.map((i) => ({
      severity: i.severity as "critical" | "warning" | "info",
      isFalsePositive: i.isFalsePositive,
    })),
  );

  const entityScore = entityRows[0]?.scoreOf10
    ? Math.round(Number(entityRows[0].scoreOf10) * 10)
    : 0;

  const linkedinPresenceScore = linkedinRows[0]?.presenceScore ?? null;

  const consensusScores = consensusRows
    .map((r) => r.consistencyScore)
    .filter((s): s is number => s !== null);
  const consensusScore =
    consensusScores.length > 0
      ? Math.round(
          consensusScores.reduce((a, b) => a + b, 0) / consensusScores.length,
        )
      : null;

  const youtubePresenceScore = youtubeRows[0]?.presenceScore ?? null;

  const scores = [
    100 - hallucinationRisk,
    entityScore,
    linkedinPresenceScore,
    consensusScore,
    youtubePresenceScore,
  ].filter((s): s is number => s !== null);

  const overallTrustScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

  return {
    hallucinationRisk,
    entityScore,
    linkedinPresenceScore,
    consensusScore,
    youtubePresenceScore,
    overallTrustScore,
  };
}
