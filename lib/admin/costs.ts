import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands, citations, engineCallFailures, organizations } from "@/db/schema";
import { googleSurfaceResults } from "@/db/schema/google-surfaces";
import { getAuditCosts } from "@/lib/audit/answered-count";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { getOrgTimezone, monthInTzSql } from "@/lib/platform/org-timezone";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { TIER_DEFINITIONS, tierDisplayName } from "@/lib/pricing/tiers";

/**
 * Part 14 (Sri, 13 Nov): what Vunnara pays its providers, for operators only and only on /admin
 * (app/(auth)/admin/costs/page.tsx, app/api/admin/costs/route.ts; both check the operator on the server).
 * Customer pages, exports and APIs never carry these figures (lib/costs/customer-safe.ts).
 *
 * Its own module, so the planned operator console (Sri's "Vunnara operator console plan", phase C) can take
 * it over as it is. Month to date in Sydney time, per workspace and per audit:
 * - each engine: what each answer and failed call recorded (citations.llm_cost_usd,
 *   engine_call_failures.cost_usd), the same figures getAuditCosts sums;
 * - Google (DataForSEO): what each Google task recorded (google_surface_results.cost_usd), counted in every
 *   total (it was never in the old "LLM spend" card);
 * - follow-up checks recorded after the audit (competitor comparisons, query fan-out), in A$ cents as stored.
 * Read across workspaces with serviceDb, as /admin/settings reads them: the caller is the operator check.
 */

export interface EngineCost {
  engine: string;
  name: string;
  usd: number;
}

export interface OperatorAuditCost {
  auditId: string;
  auditNumber: number | null;
  brandName: string;
  status: string;
  createdAt: string;
  engines: EngineCost[];
  googleUsd: number;
  /** Engines plus Google, in US$ (what the providers bill). */
  totalUsd: number;
  /** Follow-up checks after the audit, as stored (A$ cents). */
  followUpAudCents: number;
  /** Part of the cost had no price (a timed-out call, an unpriced model): the total is a floor. */
  incomplete: boolean;
}

export interface OperatorWorkspaceCost {
  organizationId: string;
  name: string;
  plan: string;
  /** The plan's monthly list price incl. GST (A$ cents), for context; null for a price agreed per deal. */
  planPriceAudCents: number | null;
  audits: OperatorAuditCost[];
  byEngine: EngineCost[];
  enginesUsd: number;
  googleUsd: number;
  totalUsd: number;
  followUpAudCents: number;
  incomplete: boolean;
}

export interface OperatorCosts {
  /** When this was read: the window is the Sydney calendar month up to here (monthWindowLabel words it). */
  asOf: string;
  workspaces: OperatorWorkspaceCost[];
  byEngine: EngineCost[];
  enginesUsd: number;
  googleUsd: number;
  totalUsd: number;
  followUpAudCents: number;
  incomplete: boolean;
}

const ENGINE_NAMES: Record<string, string> = { ...ENGINE_DISPLAY_NAMES };

function sumByEngine(lists: EngineCost[][]): EngineCost[] {
  const totals = new Map<string, number>();
  for (const list of lists) {
    for (const e of list) totals.set(e.engine, (totals.get(e.engine) ?? 0) + e.usd);
  }
  return [...totals]
    .map(([engine, usd]) => ({ engine, name: ENGINE_NAMES[engine] ?? engine, usd }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function planPrice(tier: string): number | null {
  if (tier === "enterprise") return null;
  return TIER_DEFINITIONS.find((t) => t.key === tier)?.monthlyPriceCentsIncGst ?? null;
}

const usd = (v: string | null) => (v === null ? 0 : Number(v));

/** Month to date (Sydney time) across every workspace with an audit this month. */
export async function loadOperatorCosts(now: Date = new Date()): Promise<OperatorCosts> {
  const { start, end } = monthInTzSql(getOrgTimezone(), now);
  const auditRows = await serviceDb
    .select({
      id: audits.id,
      auditNumber: audits.auditNumber,
      organizationId: audits.organizationId,
      organizationName: organizations.name,
      brandName: brands.name,
      status: audits.status,
      createdAt: audits.createdAt,
    })
    .from(audits)
    .innerJoin(organizations, eq(organizations.id, audits.organizationId))
    .innerJoin(brands, eq(brands.id, audits.brandId))
    .where(and(gte(audits.createdAt, start), lt(audits.createdAt, end)))
    .orderBy(organizations.name, audits.createdAt);
  const ids = auditRows.map((a) => a.id);

  const [answerRows, failureRows, googleRows, costs] = await Promise.all([
    ids.length === 0
      ? []
      : serviceDb
          .select({
            auditId: citations.auditId,
            engine: citations.engine,
            usd: sql<string>`COALESCE(SUM(${citations.llmCostUsd}), 0)`,
          })
          .from(citations)
          .where(inArray(citations.auditId, ids))
          .groupBy(citations.auditId, citations.engine),
    ids.length === 0
      ? []
      : serviceDb
          .select({
            auditId: engineCallFailures.auditId,
            engine: engineCallFailures.engine,
            usd: sql<string>`COALESCE(SUM(${engineCallFailures.costUsd}), 0)`,
          })
          .from(engineCallFailures)
          .where(inArray(engineCallFailures.auditId, ids))
          .groupBy(engineCallFailures.auditId, engineCallFailures.engine),
    ids.length === 0
      ? []
      : serviceDb
          .select({
            auditId: googleSurfaceResults.auditId,
            usd: sql<string>`COALESCE(SUM(${googleSurfaceResults.costUsd}), 0)`,
          })
          .from(googleSurfaceResults)
          .where(inArray(googleSurfaceResults.auditId, ids))
          .groupBy(googleSurfaceResults.auditId),
    getAuditCosts(serviceDb, ids),
  ]);

  const enginesOf = new Map<string, Map<string, number>>();
  for (const row of [...answerRows, ...failureRows]) {
    const map = enginesOf.get(row.auditId) ?? new Map<string, number>();
    map.set(row.engine, (map.get(row.engine) ?? 0) + usd(row.usd));
    enginesOf.set(row.auditId, map);
  }
  const googleOf = new Map(googleRows.map((g) => [g.auditId, usd(g.usd)]));

  const byWorkspace = new Map<string, { name: string; audits: OperatorAuditCost[] }>();
  for (const a of auditRows) {
    const engines = [...(enginesOf.get(a.id) ?? new Map<string, number>())]
      .map(([engine, v]) => ({ engine, name: ENGINE_NAMES[engine] ?? engine, usd: v }))
      .sort((x, y) => x.name.localeCompare(y.name));
    const googleUsd = googleOf.get(a.id) ?? 0;
    const cost = costs.get(a.id);
    const row: OperatorAuditCost = {
      auditId: a.id,
      auditNumber: a.auditNumber,
      brandName: a.brandName,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      engines,
      googleUsd,
      totalUsd: engines.reduce((s, e) => s + e.usd, 0) + googleUsd,
      followUpAudCents: cost?.followUpAudCents ?? 0,
      incomplete: cost?.incomplete ?? false,
    };
    const ws = byWorkspace.get(a.organizationId) ?? { name: a.organizationName, audits: [] };
    ws.audits.push(row);
    byWorkspace.set(a.organizationId, ws);
  }

  const workspaces: OperatorWorkspaceCost[] = [];
  for (const [organizationId, ws] of byWorkspace) {
    const tier = await effectiveTier(serviceDb, organizationId);
    const byEngine = sumByEngine(ws.audits.map((a) => a.engines));
    const enginesUsd = byEngine.reduce((s, e) => s + e.usd, 0);
    const googleUsd = ws.audits.reduce((s, a) => s + a.googleUsd, 0);
    workspaces.push({
      organizationId,
      name: ws.name,
      plan: tierDisplayName(tier),
      planPriceAudCents: planPrice(tier),
      audits: ws.audits,
      byEngine,
      enginesUsd,
      googleUsd,
      totalUsd: enginesUsd + googleUsd,
      followUpAudCents: ws.audits.reduce((s, a) => s + a.followUpAudCents, 0),
      incomplete: ws.audits.some((a) => a.incomplete),
    });
  }
  workspaces.sort((a, b) => b.totalUsd - a.totalUsd || a.name.localeCompare(b.name));

  const byEngine = sumByEngine(workspaces.map((w) => w.byEngine));
  const enginesUsd = byEngine.reduce((s, e) => s + e.usd, 0);
  const googleUsd = workspaces.reduce((s, w) => s + w.googleUsd, 0);
  return {
    asOf: now.toISOString(),
    workspaces,
    byEngine,
    enginesUsd,
    googleUsd,
    totalUsd: enginesUsd + googleUsd,
    followUpAudCents: workspaces.reduce((s, w) => s + w.followUpAudCents, 0),
    incomplete: workspaces.some((w) => w.incomplete),
  };
}
