import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { engineCallFailures } from "@/db/schema";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { PROVIDER_QUOTA, providerMessageOf } from "./provider-quota";

/**
 * S04B part 2 (LLD amendment 100): the engines' refusals for the operator settings page's Provider errors section
 * (/admin/settings), beside Google's: one line per engine and provider message, newest first -- the engine, the class,
 * the provider's own message, when it was first and last seen, and the audits it affected. Calls actually sent and
 * refused (attempts > 0) make the line; the calls not sent after them are counted beside it.
 *
 * Every workspace's failures, so it reads with serviceDb, as Google's provider errors do
 * (lib/audit/google-surfaces/operator.ts loadGoogleProviderErrorGroups): the page is platform admins' only.
 */

export interface EngineRefusalGroup {
  key: string;
  /** "Claude". */
  engine: string;
  errorClass: string;
  /** The provider's own words (providerMessageOf). */
  message: string;
  firstSeen: string;
  lastSeen: string;
  audits: number;
  refused: number;
  notSent: number;
}

export interface EngineRefusalGroups {
  groups: EngineRefusalGroup[];
  /** How many lines there are in all; more than groups.length means the page shows the latest only. */
  total: number;
}

export async function loadEngineRefusalGroups(limit = 10): Promise<EngineRefusalGroups> {
  const refusedRows = and(
    eq(engineCallFailures.errorClass, PROVIDER_QUOTA),
    gt(engineCallFailures.attempts, 0),
  );
  const shown = await serviceDb
    .select({
      engine: engineCallFailures.engine,
      errorClass: engineCallFailures.errorClass,
      message: engineCallFailures.errorMessage,
      firstSeen: sql<string>`min(${engineCallFailures.createdAt})`.mapWith((v: string | Date) =>
        new Date(v).toISOString(),
      ),
      lastSeen: sql<string>`max(${engineCallFailures.createdAt})`.mapWith((v: string | Date) =>
        new Date(v).toISOString(),
      ),
      auditIds: sql<string[]>`array_agg(DISTINCT ${engineCallFailures.auditId})`,
      refused: sql<number>`count(*)`.mapWith(Number),
      total: sql<number>`count(*) over ()`.mapWith(Number),
    })
    .from(engineCallFailures)
    .where(refusedRows)
    .groupBy(
      engineCallFailures.engine,
      engineCallFailures.errorClass,
      engineCallFailures.errorMessage,
    )
    .orderBy(desc(sql`max(${engineCallFailures.createdAt})`))
    .limit(limit);
  if (shown.length === 0) return { groups: [], total: 0 };

  const auditIds = [...new Set(shown.flatMap((g) => g.auditIds))];
  const notSentRows = await serviceDb
    .select({
      engine: engineCallFailures.engine,
      auditId: engineCallFailures.auditId,
      calls: sql<number>`count(*)`.mapWith(Number),
    })
    .from(engineCallFailures)
    .where(
      and(
        eq(engineCallFailures.errorClass, PROVIDER_QUOTA),
        eq(engineCallFailures.attempts, 0),
        inArray(engineCallFailures.auditId, auditIds),
      ),
    )
    .groupBy(engineCallFailures.engine, engineCallFailures.auditId);
  const notSentOf = (engine: string, ids: readonly string[]) =>
    notSentRows
      .filter((r) => r.engine === engine && ids.includes(r.auditId))
      .reduce((n, r) => n + r.calls, 0);

  return {
    total: shown[0]?.total ?? 0,
    groups: shown.map((g) => ({
      key: `${g.engine}|${g.errorClass}|${g.message ?? ""}`,
      engine: (ENGINE_DISPLAY_NAMES as Record<string, string>)[g.engine] ?? g.engine,
      errorClass: g.errorClass,
      message: providerMessageOf(g.message ?? ""),
      firstSeen: g.firstSeen,
      lastSeen: g.lastSeen,
      audits: g.auditIds.length,
      refused: g.refused,
      notSent: notSentOf(g.engine, g.auditIds),
    })),
  };
}
