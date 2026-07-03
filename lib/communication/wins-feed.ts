import { and, desc, eq, gt, gte, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import {
  audits,
  citations,
  remediationTasks,
  shareOfVoiceSnapshots,
  visibilityTrends,
} from "@/db/schema";
import type { Win, WinType } from "@/lib/visibility/types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function clampLimit(requested?: number): number {
  if (!requested || requested <= 0) return DEFAULT_LIMIT;
  return Math.min(requested, MAX_LIMIT);
}

export async function getWinsFeed(
  tx: DbClient,
  brandId: string,
  options?: { limit?: number; since?: Date },
): Promise<Win[]> {
  const limit = clampLimit(options?.limit);
  const wins: Win[] = [];

  const [newCitations, engineCoverage, visibilityUps, competitorDowns, closedGaps] =
    await Promise.all([
      findNewCitations(tx, brandId, options?.since),
      findNewEngineCoverage(tx, brandId, options?.since),
      findVisibilityUp(tx, brandId, options?.since),
      findCompetitorDown(tx, brandId, options?.since),
      findGapsClosed(tx, brandId, options?.since),
    ]);

  wins.push(...newCitations, ...engineCoverage, ...visibilityUps, ...competitorDowns, ...closedGaps);

  wins.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  return wins.slice(0, limit);
}

async function findNewCitations(
  tx: DbClient,
  brandId: string,
  since?: Date,
): Promise<Win[]> {
  const conditions = [
    eq(citations.brandMentioned, true),
    eq(audits.brandId, brandId),
    eq(audits.status, "complete"),
  ];
  if (since) {
    conditions.push(gte(citations.createdAt, since));
  }

  const rows = await tx
    .select({
      engine: citations.engine,
      prompt: citations.prompt,
      createdAt: citations.createdAt,
    })
    .from(citations)
    .innerJoin(audits, eq(citations.auditId, audits.id))
    .where(and(...conditions))
    .orderBy(desc(citations.createdAt))
    .limit(5);

  return rows.map((r) => ({
    type: "new_citation" as WinType,
    headline: `New citation on ${r.engine}`,
    metricDelta: null,
    reason: `likely linked to: brand content appeared in AI response for "${r.prompt}"`,
    detectedAt: r.createdAt,
    engine: r.engine,
    prompt: r.prompt,
  }));
}

async function findNewEngineCoverage(
  tx: DbClient,
  brandId: string,
  since?: Date,
): Promise<Win[]> {
  const conditions = [
    eq(audits.brandId, brandId),
    eq(audits.status, "complete"),
  ];
  if (since) {
    conditions.push(gte(audits.completedAt, since));
  }

  const rows = await tx
    .select({
      engine: citations.engine,
      count: sql<number>`COUNT(DISTINCT ${citations.engine})`,
      latestAt: sql<string>`MAX(${citations.createdAt})`,
    })
    .from(citations)
    .innerJoin(audits, eq(citations.auditId, audits.id))
    .where(and(...conditions, eq(citations.brandMentioned, true)))
    .groupBy(citations.engine)
    .limit(5);

  if (rows.length <= 1) return [];

  return rows.slice(0, 3).map((r) => ({
    type: "new_engine_coverage" as WinType,
    headline: `Brand visible on ${r.engine}`,
    metricDelta: null,
    reason: `likely linked to: your brand now appears across ${rows.length} AI engines`,
    detectedAt: new Date(r.latestAt),
    engine: r.engine,
  }));
}

async function findVisibilityUp(
  tx: DbClient,
  brandId: string,
  since?: Date,
): Promise<Win[]> {
  const conditions = [eq(visibilityTrends.brandId, brandId)];
  if (since) {
    conditions.push(gte(visibilityTrends.calculatedAt, since));
  }

  const rows = await tx
    .select()
    .from(visibilityTrends)
    .where(and(...conditions))
    .orderBy(desc(visibilityTrends.calculatedAt))
    .limit(2);

  if (rows.length < 2) return [];

  const current = Number(rows[0].scoreCompositeAvg ?? 0);
  const previous = Number(rows[1].scoreCompositeAvg ?? 0);
  const delta = current - previous;

  if (delta <= 0) return [];

  return [
    {
      type: "visibility_up" as WinType,
      headline: `Visibility score up +${delta.toFixed(1)} points`,
      metricDelta: Math.round(delta * 100) / 100,
      reason: `likely linked to: composite visibility improved from ${previous.toFixed(1)} to ${current.toFixed(1)}`,
      detectedAt: rows[0].calculatedAt,
    },
  ];
}

async function findCompetitorDown(
  tx: DbClient,
  brandId: string,
  since?: Date,
): Promise<Win[]> {
  const conditions = [eq(shareOfVoiceSnapshots.brandId, brandId)];
  if (since) {
    conditions.push(gte(shareOfVoiceSnapshots.calculatedAt, since));
  }

  const rows = await tx
    .select({
      competitor: shareOfVoiceSnapshots.competitorDomain,
      brandShare: shareOfVoiceSnapshots.brandShare,
      competitorShare: shareOfVoiceSnapshots.competitorShare,
      calculatedAt: shareOfVoiceSnapshots.calculatedAt,
    })
    .from(shareOfVoiceSnapshots)
    .where(
      and(
        ...conditions,
        gt(shareOfVoiceSnapshots.brandShare, shareOfVoiceSnapshots.competitorShare),
      ),
    )
    .orderBy(desc(shareOfVoiceSnapshots.calculatedAt))
    .limit(3);

  return rows.map((r) => ({
    type: "competitor_down" as WinType,
    headline: `You lead ${r.competitor} in share of voice`,
    metricDelta: Number(r.brandShare) - Number(r.competitorShare),
    reason: `likely linked to: your brand share (${Number(r.brandShare).toFixed(1)}%) exceeds ${r.competitor} (${Number(r.competitorShare).toFixed(1)}%)`,
    detectedAt: r.calculatedAt,
  }));
}

async function findGapsClosed(
  tx: DbClient,
  brandId: string,
  since?: Date,
): Promise<Win[]> {
  const conditions = [
    eq(remediationTasks.brandId, brandId),
    eq(remediationTasks.status, "done"),
  ];
  if (since) {
    conditions.push(gte(remediationTasks.completedAt, since));
  }

  const rows = await tx
    .select({
      title: remediationTasks.title,
      completedAt: remediationTasks.completedAt,
      liftAchieved: remediationTasks.liftAchieved,
    })
    .from(remediationTasks)
    .where(and(...conditions))
    .orderBy(desc(remediationTasks.completedAt))
    .limit(5);

  return rows
    .filter((r) => r.completedAt !== null)
    .map((r) => ({
      type: "gap_closed" as WinType,
      headline: `Task completed: ${r.title}`,
      metricDelta: r.liftAchieved ? Number(r.liftAchieved) : null,
      reason: `likely linked to: remediation task "${r.title}" was completed${
        r.liftAchieved ? ` with ${Number(r.liftAchieved).toFixed(1)}pt lift` : ""
      }`,
      detectedAt: r.completedAt!,
    }));
}
