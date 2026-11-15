import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, brands, citations, remediationTasks } from "@/db/schema";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { latestCompleteAudit, shareOfVoiceForAudit } from "@/lib/visibility/share-of-voice";
import { formatSharePercent } from "@/lib/visibility/share-of-voice-display";
import type { Win, WinType } from "@/lib/visibility/types";
import { includedInTrends } from "@/lib/audit/trend-exclusion-sql";
import { auditChanges } from "@/lib/visibility/audit-change";
import { possessive } from "@/lib/copy/possessive";

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

  wins.push(
    ...newCitations,
    ...engineCoverage,
    ...visibilityUps,
    ...competitorDowns,
    ...closedGaps,
  );

  wins.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
  return wins.slice(0, limit);
}

async function findNewCitations(tx: DbClient, brandId: string, since?: Date): Promise<Win[]> {
  const conditions = [
    eq(citations.brandMentioned, true),
    eq(audits.brandId, brandId),
    eq(audits.status, "complete"),
    ORGANIC_ONLY,
    // Vunnara Build 1, Part F.3: run_number = 1 only -- a historical
    // audit from before Part F.1 removed the replay loop could
    // otherwise surface the exact same win up to 5 times in this
    // latest-5 feed (every replay is byte-identical, including its
    // createdAt-ordered position).
    eq(citations.runNumber, 1),
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

async function findNewEngineCoverage(tx: DbClient, brandId: string, since?: Date): Promise<Win[]> {
  const conditions = [eq(audits.brandId, brandId), eq(audits.status, "complete")];
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
    .where(and(...conditions, eq(citations.brandMentioned, true), ORGANIC_ONLY))
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

/**
 * Leftovers task, part 6 (17 Nov): the brand's latest audit against the one before it, as the audit pages count them
 * (lib/visibility/audit-change.ts) -- only when the two are comparable (the same method, questions and models; neither
 * excluded from trends) and the figure went up. It compared the two newest weekly trend rows' average headline
 * (visibility_trends), ordered by when each row was first made, under another definition than the audit page's, and
 * said the rise was "likely linked to" a share no audit showed.
 */
async function findVisibilityUp(tx: DbClient, brandId: string, since?: Date): Promise<Win[]> {
  const latest = await tx
    .select({ id: audits.id, completedAt: audits.completedAt })
    .from(audits)
    .where(and(eq(audits.brandId, brandId), eq(audits.status, "complete"), includedInTrends))
    .orderBy(sql`${audits.completedAt} DESC NULLS LAST`, desc(audits.auditNumber))
    .limit(2);
  if (latest.length < 2) return [];
  const [after, before] = latest;
  if (!after.completedAt || (since && after.completedAt < since)) return [];

  const change = (
    await auditChanges(tx, [{ key: "latest", beforeId: before.id, afterId: after.id }])
  ).get("latest");
  if (change?.kind !== "measured" || change.direction !== "up") return [];
  return [
    {
      type: "visibility_up" as WinType,
      headline: `Visibility up ${change.points} ${change.points === 1 ? "point" : "points"}`,
      metricDelta: change.points,
      reason: change.line,
      detectedAt: after.completedAt,
    },
  ];
}

/**
 * One Share of Voice (7 Nov): the configured competitors the brand out-mentions in its latest complete
 * audit, from the one counter (lib/visibility/share-of-voice.ts) -- the figures the Overview, the
 * Visibility page and the PDF show. It used to read share_of_voice_snapshots, where a "competitor" was
 * any site the answers cited and the brand's count included unverified name matches.
 */
async function findCompetitorDown(tx: DbClient, brandId: string, since?: Date): Promise<Win[]> {
  const [brand] = await tx
    .select({
      id: brands.id,
      name: brands.name,
      competitors: brands.competitors,
      competitorWebsites: brands.competitorWebsites,
    })
    .from(brands)
    .where(eq(brands.id, brandId));
  if (!brand) return [];
  const audit = await latestCompleteAudit(tx, brandId);
  const completedAt = audit?.completedAt ?? null;
  if (!audit || !completedAt || (since && completedAt < since)) return [];

  const sov = await shareOfVoiceForAudit(tx, brand, audit);
  const brandShare = sov.sharePct;
  if (sov.state !== "measured" || brandShare === null) return [];

  return sov.competitors
    .filter((c) => c.mentions < sov.brandMentions)
    .sort((a, b) => a.mentions - b.mentions || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((c) => {
      const theirShare = c.sharePct ?? 0;
      return {
        type: "competitor_down" as WinType,
        headline: `You lead ${c.name} in share of voice`,
        metricDelta: Math.round((brandShare - theirShare) * 100) / 100,
        reason: `likely linked to: your share of voice (${formatSharePercent(brandShare)}, ${sov.brandMentions} of ${sov.totalMentions} verified mentions) is above ${possessive(c.name)} (${formatSharePercent(theirShare)}, ${c.mentions} of ${sov.totalMentions})`,
        detectedAt: completedAt,
      };
    });
}

async function findGapsClosed(tx: DbClient, brandId: string, since?: Date): Promise<Win[]> {
  const conditions = [eq(remediationTasks.brandId, brandId), eq(remediationTasks.status, "done")];
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
