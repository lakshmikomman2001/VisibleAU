import { endOfISOWeek, startOfISOWeek } from "date-fns";
import { and, count, desc, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { notInTheSampleWorkspace } from "@/db/open-workspace";
import {
  audits,
  brands,
  featureSettingChanges,
  organizations,
  users,
  visibilityTrends,
} from "@/db/schema";
import { normalizeTrendExclusionReason } from "@/lib/audit/trend-exclusion";
import { recordAction } from "@/lib/governance/audit-trail";
import { PRODUCT_NAME } from "@/lib/product";
import { refreshWeeklyVisibilityTrend } from "@/lib/visibility/refresh-weekly-trend";
import {
  formatPeriodLabel,
  periodComparableAudits,
} from "@/lib/visibility/visibility-trend-aggregator";

/**
 * 14 Nov, part 5 -- /admin/audits: the operator excludes an audit from trends and comparisons, with a reason,
 * or includes it again (audits.excluded_from_trends_reason, migration 0148; lib/audit/trend-exclusion.ts says
 * what that leaves out). Each change is one transaction: the audit's reason, a row in the operator's change
 * history (feature_setting_changes, scope "brand", the audit's brand and workspace), and the audit's week of
 * visibility_trends recomputed without it (lib/visibility/refresh-weekly-trend.ts, what the aggregate-
 * visibility-trend function runs), so the Visibility page and the wins feed stop counting it too. Nothing
 * is deleted: the audit, its answers and its PDFs stay. Only reached after checkPlatformAdmin.
 *
 * 15 Nov, part 3 (Sri's decision): every change is also written to that workspace's own Audit Trail ("Vunnara
 * excluded audit #46 from trends: measured with an earlier version of the mention check"), so the customer sees
 * every change Vunnara makes to their data. The whole change runs in one transaction under the workspace's RLS
 * context (withRlsContext, the app's role): the audit, the trend rows and the trail entry are written through the
 * workspace's own policies, never around them. feature_setting_changes is the operator's table (no RLS).
 */

/** feature_setting_changes.setting_key for these changes. /admin/settings' history leaves them out. */
export const TREND_EXCLUSION_SETTING_KEY = "audit_trend_exclusion";

/** How many of the newest complete audits the page lists (every excluded one is listed too). */
export const RECENT_AUDITS_LISTED = 50;

export type TrendExclusionSaveResult = "saved" | "unchanged";

export class TrendExclusionRejected extends Error {}

export interface TrendExclusionAudit {
  id: string;
  auditNumber: number;
  completedAt: string | null;
  brandId: string;
  brandName: string;
  workspaceName: string;
  excludedFromTrendsReason: string | null;
  /** 15 Nov, part 4: the brand was deleted; its audits are listed only when the operator asks, labelled. */
  brandDeleted: boolean;
}

export interface TrendExclusionChange {
  at: string;
  brand: string | null;
  workspace: string | null;
  auditNumber: number | null;
  from: string | null;
  to: string | null;
  by: string | null;
}

export interface TrendExclusionAdminView {
  audits: TrendExclusionAudit[];
  changes: TrendExclusionChange[];
  /** 15 Nov, part 4 (Sri): deleted brands' audits are hidden unless asked for (/admin/audits?deleted=1). */
  showDeletedBrands: boolean;
  /** How many complete audits there are, of the brands listed (deleted ones only when shown). */
  completeAudits: number;
  /** How many of the newest of those are listed (at most RECENT_AUDITS_LISTED). */
  newestListed: number;
  /** Excluded audits listed besides, older than those. */
  olderExcluded: number;
  /** Complete audits of deleted brands, shown or not: the toggle's count. */
  deletedBrandAudits: number;
}

/** What the history stores for one side of a change: the audit, and its reason (null: counted). */
interface StoredExclusion {
  auditId: string;
  auditNumber: number;
  reason: string;
}

function storedReason(value: unknown): { auditNumber: number | null; reason: string | null } {
  if (value && typeof value === "object" && "reason" in value) {
    const v = value as Partial<StoredExclusion>;
    return {
      auditNumber: typeof v.auditNumber === "number" ? v.auditNumber : null,
      reason: typeof v.reason === "string" ? v.reason : null,
    };
  }
  return { auditNumber: null, reason: null };
}

export async function loadTrendExclusionAdminView({
  showDeletedBrands = false,
}: {
  showDeletedBrands?: boolean;
} = {}): Promise<TrendExclusionAdminView> {
  const select = {
    id: audits.id,
    auditNumber: audits.auditNumber,
    completedAt: audits.completedAt,
    brandId: audits.brandId,
    brandName: brands.name,
    workspaceName: organizations.name,
    excludedFromTrendsReason: audits.excludedFromTrendsReason,
    brandDeletedAt: brands.deletedAt,
  };
  // 15 Nov, part 4: a deleted brand's audits only when the operator asks for them.
  const listedBrands: SQL | undefined = showDeletedBrands ? undefined : isNull(brands.deletedAt);
  // 20 Nov (part 9): customers' audits only -- not the free sample's (a visitor's one-off, never in a trend).
  const complete = and(
    eq(audits.status, "complete"),
    listedBrands,
    notInTheSampleWorkspace(audits.organizationId),
  );
  const [recent, excluded, [totals], [deletedTotals]] = await Promise.all([
    serviceDb
      .select(select)
      .from(audits)
      .innerJoin(brands, eq(brands.id, audits.brandId))
      .innerJoin(organizations, eq(organizations.id, audits.organizationId))
      .where(complete)
      .orderBy(desc(audits.completedAt))
      .limit(RECENT_AUDITS_LISTED),
    serviceDb
      .select(select)
      .from(audits)
      .innerJoin(brands, eq(brands.id, audits.brandId))
      .innerJoin(organizations, eq(organizations.id, audits.organizationId))
      .where(and(isNotNull(audits.excludedFromTrendsReason), listedBrands))
      .orderBy(desc(audits.completedAt)),
    serviceDb
      .select({ n: count() })
      .from(audits)
      .innerJoin(brands, eq(brands.id, audits.brandId))
      .where(complete),
    serviceDb
      .select({ n: count() })
      .from(audits)
      .innerJoin(brands, eq(brands.id, audits.brandId))
      .where(and(eq(audits.status, "complete"), isNotNull(brands.deletedAt))),
  ]);
  const byId = new Map<string, (typeof recent)[number]>();
  for (const a of [...recent, ...excluded]) byId.set(a.id, a);
  const listed = [...byId.values()].sort(
    (a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
  );

  const changes = await serviceDb
    .select({
      at: featureSettingChanges.createdAt,
      brand: brands.name,
      workspace: organizations.name,
      from: featureSettingChanges.oldValue,
      to: featureSettingChanges.newValue,
      by: users.email,
    })
    .from(featureSettingChanges)
    .leftJoin(organizations, eq(organizations.id, featureSettingChanges.targetWorkspaceId))
    .leftJoin(brands, eq(brands.id, featureSettingChanges.targetBrandId))
    .leftJoin(users, eq(users.id, featureSettingChanges.changedByUserId))
    .where(eq(featureSettingChanges.settingKey, TREND_EXCLUSION_SETTING_KEY))
    .orderBy(desc(featureSettingChanges.createdAt))
    .limit(50);

  return {
    audits: listed.map((a) => ({
      id: a.id,
      auditNumber: a.auditNumber,
      completedAt: a.completedAt?.toISOString() ?? null,
      brandId: a.brandId,
      brandName: a.brandName,
      workspaceName: a.workspaceName,
      excludedFromTrendsReason: a.excludedFromTrendsReason,
      brandDeleted: a.brandDeletedAt !== null,
    })),
    showDeletedBrands,
    completeAudits: Number(totals?.n ?? 0),
    newestListed: recent.length,
    olderExcluded: listed.length - recent.length,
    deletedBrandAudits: Number(deletedTotals?.n ?? 0),
    changes: changes.map((c) => {
      const from = storedReason(c.from);
      const to = storedReason(c.to);
      return {
        at: c.at.toISOString(),
        brand: c.brand,
        workspace: c.workspace,
        auditNumber: to.auditNumber ?? from.auditNumber,
        from: from.reason,
        to: to.reason,
        by: c.by,
      };
    }),
  };
}

/**
 * Excludes a complete audit from trends with `reason`, or (reason null or blank) includes it again. "unchanged"
 * when that's already so: nothing is written, not even the history.
 */
export async function setAuditTrendExclusion(
  auditId: string,
  rawReason: string | null,
  actorUserId: string | null,
): Promise<TrendExclusionSaveResult> {
  const reason = normalizeTrendExclusionReason(rawReason);
  const [audit] = await serviceDb
    .select({
      id: audits.id,
      auditNumber: audits.auditNumber,
      status: audits.status,
      completedAt: audits.completedAt,
      brandId: audits.brandId,
      organizationId: audits.organizationId,
      excludedFromTrendsReason: audits.excludedFromTrendsReason,
      brandDomain: brands.domain,
    })
    .from(audits)
    .innerJoin(brands, eq(brands.id, audits.brandId))
    .where(eq(audits.id, auditId));
  if (!audit) throw new TrendExclusionRejected("That audit doesn't exist.");
  if (audit.status !== "complete" || !audit.completedAt) {
    throw new TrendExclusionRejected(
      "Only a complete audit can be excluded: an unfinished one isn't in any trend.",
    );
  }
  const before = normalizeTrendExclusionReason(audit.excludedFromTrendsReason);
  if (before === reason) return "unchanged";

  const side = (r: string | null): StoredExclusion | null =>
    r === null ? null : { auditId: audit.id, auditNumber: audit.auditNumber, reason: r };
  const completedAt = audit.completedAt;

  await withRlsContext(audit.organizationId, async (tx) => {
    await tx
      .update(audits)
      .set({ excludedFromTrendsReason: reason })
      .where(eq(audits.id, audit.id));
    await tx.insert(featureSettingChanges).values({
      scope: "brand",
      settingKey: TREND_EXCLUSION_SETTING_KEY,
      targetWorkspaceId: audit.organizationId,
      targetBrandId: audit.brandId,
      oldValue: side(before),
      newValue: side(reason),
      changedByUserId: actorUserId,
    });
    // The audit's week, recomputed from the audits that count in it now. A week left with none (its only
    // audit excluded) has no figures: its row goes, rather than a week of zeros on the Visibility chart.
    const counted = await periodComparableAudits(
      tx,
      audit.brandId,
      startOfISOWeek(completedAt),
      endOfISOWeek(completedAt),
    );
    if (counted.auditIds.length === 0) {
      await tx
        .delete(visibilityTrends)
        .where(
          and(
            eq(visibilityTrends.brandId, audit.brandId),
            eq(visibilityTrends.periodLabel, formatPeriodLabel(completedAt, "weekly")),
            eq(visibilityTrends.periodType, "weekly"),
          ),
        );
    } else {
      await refreshWeeklyVisibilityTrend(tx, {
        brandId: audit.brandId,
        organizationId: audit.organizationId,
        brandDomain: audit.brandDomain,
        completedAt,
      });
    }
    // The workspace's own record of it, with the change (no user: the actor is Vunnara, not a member).
    await recordAction(
      {
        organizationId: audit.organizationId,
        userId: null,
        action: "trend_exclusion_changed",
        resourceType: "audit",
        resourceId: audit.id,
        metadata: {
          summary: trendExclusionTrailSummary(audit.auditNumber, before, reason),
          auditNumber: audit.auditNumber,
          ...(before !== null ? { previousReason: before } : {}),
          ...(reason !== null ? { reason } : {}),
          changedBy: PRODUCT_NAME,
        },
      },
      tx,
    );
  });
  return "saved";
}

/**
 * What the workspace's Audit Trail says for a change: "Vunnara excluded audit #46 from trends: measured with an
 * earlier version of the mention check", "Vunnara included audit #46 in trends again (it was excluded: …)", or
 * "Vunnara changed why audit #46 is excluded from trends: … (was: …)".
 */
export function trendExclusionTrailSummary(
  auditNumber: number,
  before: string | null,
  after: string | null,
): string {
  if (after === null) {
    return `${PRODUCT_NAME} included audit #${auditNumber} in trends again (it was excluded: ${before ?? "no reason recorded"})`;
  }
  if (before === null)
    return `${PRODUCT_NAME} excluded audit #${auditNumber} from trends: ${after}`;
  return `${PRODUCT_NAME} changed why audit #${auditNumber} is excluded from trends: ${after} (was: ${before})`;
}
