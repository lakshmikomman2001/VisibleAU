import { and, desc, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import {
  brandConsensusChecks,
  brandEntityScores,
  hallucinationIncidents,
  linkedinPresenceAudits,
  youtubePresenceAudits,
} from "@/db/schema";
import { getBrandCitationCount } from "./citation-coverage";
import { computeHallucinationRisk } from "./hallucination-risk";
import { TRUST_CHECK_IMPLEMENTED } from "./stub-implementation-status";

export interface TrustSummary {
  hallucinationRisk: number;
  // Trust Intelligence honesty pass: the number of AI-engine citations
  // ever recorded for this brand. 0 means hallucinationRisk's 0 is "0 of
  // 0 checked", not a measured clean record -- callers must gate the
  // "clean record" framing on this being > 0. See
  // docs/ops/post-launch-db-hardening.md section 34.
  citationCount: number;
  // Follow-up to the Trust Intelligence honesty pass: null (not 0) when
  // no brandEntityScores row exists yet -- a never-audited brand must
  // show "insufficient data", not a damning 0. A real measured score of
  // 0 (an unlikely but possible genuine result) stays 0, since the
  // check below is "does a row exist", not "is the value truthy".
  entityScore: number | null;
  linkedinPresenceScore: number | null;
  consensusScore: number | null;
  youtubePresenceScore: number | null;
  // null = every component was absent/excluded -- "insufficient data to
  // score", not a number (not even 0).
  overallTrustScore: number | null;
}

export async function computeTrustSummary(tx: DbClient, brandId: string): Promise<TrustSummary> {
  const [incidents, entityRows, linkedinRows, consensusRows, youtubeRows, citationCount] =
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
    getBrandCitationCount(tx, brandId),
  ]);

  const hallucinationRisk = computeHallucinationRisk(
    incidents.map((i) => ({
      severity: i.severity as "critical" | "warning" | "info",
      isFalsePositive: i.isFalsePositive,
    })),
  );

  const entityScore = entityRows[0]?.scoreOf10
    ? Math.round(Number(entityRows[0].scoreOf10) * 10)
    : null;

  const linkedinPresenceScore = linkedinRows[0]?.presenceScore ?? null;

  const consensusScores = consensusRows
    .map((r) => r.consistencyScore)
    .filter((s): s is number => s !== null);
  const consensusScore =
    consensusScores.length > 0
      ? Math.round(consensusScores.reduce((a, b) => a + b, 0) / consensusScores.length)
      : null;

  const youtubePresenceScore = youtubeRows[0]?.presenceScore ?? null;

  // Trust Intelligence honesty pass, then task #38's follow-up: the
  // original citationCount > 0 gate only protected the zero-coverage
  // case. It missed that detectHallucinations() never writes
  // citations.is_accurate (no fact-extraction/comparison is implemented
  // at all -- see stub-implementation-status.ts), so hallucinationRisk is
  // mathematically always 0 for EVERY brand, not just uncovered ones --
  // "100 - 0 = 100" was contributing a phantom perfect score to the
  // average for any brand with citationCount > 0, hollow detector or not.
  // Gate on the implemented flag first: a non-functional detector must
  // never float the overall, regardless of how much coverage exists.
  // citationCount > 0 stays as a second, independent guard for once the
  // real detector ships -- "0 of 0 checked" must still not read as clean.
  const scores = [
    TRUST_CHECK_IMPLEMENTED.hallucinationDetection && citationCount > 0
      ? 100 - hallucinationRisk
      : null,
    entityScore,
    linkedinPresenceScore,
    consensusScore,
    youtubePresenceScore,
  ].filter((s): s is number => s !== null);

  const overallTrustScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return {
    hallucinationRisk,
    citationCount,
    entityScore,
    linkedinPresenceScore,
    consensusScore,
    youtubePresenceScore,
    overallTrustScore,
  };
}
