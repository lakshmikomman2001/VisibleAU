import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, type SQL } from "drizzle-orm";
import { type DbClient, serviceDb } from "@/db/client";
import { brands, remediationTasks } from "@/db/schema";
import { getOrgTimezone, monthInTzSql } from "@/lib/platform/org-timezone";
import { auditChanges } from "@/lib/visibility/audit-change";

/**
 * The Autopilot tracker's figures (the dashboard's "Work completed" and "Measured impact" cards).
 *
 * 17 Nov, part 3 (Sri: every page must agree with the audit):
 * - "Measured impact" was SUM(lift_achieved) over this month's re-audited tasks, shown as "+12.3% · Citation rate
 *   improved · verified by re-audit". lift_achieved was the re-audit's Visibility minus score_before, and
 *   score_before is the recommendation's expected-impact bucket (80, 50 or 20: lib/workflow/task-manager.ts), never
 *   a measurement; and a sum of changes across tasks isn't a change in anything. Now each re-audited task's change is
 *   measured between its own audit and its re-audit (lib/visibility/audit-change.ts, the audit page's figures, only
 *   when the two are comparable), and the card counts them: how many went up, down or stayed, and the latest one in
 *   full ("Audit #48 → #52: 25% (10 of 40) → 33% (13 of 40), up 8 points").
 * - "Work completed" was "N / M gaps closed this month": N tasks done this month (counted from the UTC month) over M,
 *   every task ever. Now the month is the workspace's own (Sydney time, as the dashboard's other cards), and the
 *   figures are what they are: done this month, and still open.
 */
export interface ReauditSummary {
  /** Done this month and re-audited, with a measured change. */
  measured: number;
  up: number;
  down: number;
  same: number;
  /** Re-audited, but the two audits can't be compared (each says why on its task). */
  notComparable: number;
  /** The latest measured change, in full; null when none. */
  latest: string | null;
}

export interface ProgressSummary {
  completedThisMonth: number;
  /** Open, in progress or in review. */
  openTasks: number;
  totalTasks: number;
  reaudits: ReauditSummary;
  /** Done this month and not re-audited yet (a re-audit runs 14 days after a task is done). */
  awaitingReaudit: number;
  gapsClosed: number;
}

const OPEN_STATUSES = ["open", "in_progress", "ready_for_review"];

async function summaryFor(
  db: DbClient,
  scope: SQL,
  organizationId: string,
  now: Date,
): Promise<ProgressSummary> {
  const { start, end } = monthInTzSql(getOrgTimezone(organizationId), now);
  const doneThisMonth = and(
    scope,
    eq(remediationTasks.status, "complete"),
    gte(remediationTasks.completedAt, start),
    lt(remediationTasks.completedAt, end),
  );

  const [[completedRow], [openRow], [totalRow], [gapsRow], reaudited] = await Promise.all([
    db.select({ value: count() }).from(remediationTasks).where(doneThisMonth),
    db
      .select({ value: count() })
      .from(remediationTasks)
      .where(and(scope, inArray(remediationTasks.status, OPEN_STATUSES))),
    db.select({ value: count() }).from(remediationTasks).where(scope),
    db
      .select({ value: count() })
      .from(remediationTasks)
      .where(and(scope, eq(remediationTasks.status, "complete"))),
    db
      .select({
        id: remediationTasks.id,
        auditId: remediationTasks.auditId,
        reauditId: remediationTasks.reauditId,
      })
      .from(remediationTasks)
      .where(and(doneThisMonth, isNotNull(remediationTasks.reauditId)))
      .orderBy(desc(remediationTasks.completedAt)),
  ]);

  const changes = await auditChanges(
    db,
    reaudited.map((t) => ({ key: t.id, beforeId: t.auditId, afterId: t.reauditId })),
  );
  const reaudits: ReauditSummary = {
    measured: 0,
    up: 0,
    down: 0,
    same: 0,
    notComparable: 0,
    latest: null,
  };
  for (const task of reaudited) {
    const change = changes.get(task.id);
    if (change?.kind === "measured") {
      reaudits.measured++;
      reaudits[change.direction]++;
      reaudits.latest ??= change.line;
    } else if (change?.kind === "not_comparable") {
      reaudits.notComparable++;
    }
  }

  const completedThisMonth = Number(completedRow?.value ?? 0);
  return {
    completedThisMonth,
    openTasks: Number(openRow?.value ?? 0),
    totalTasks: Number(totalRow?.value ?? 0),
    reaudits,
    awaitingReaudit: completedThisMonth - reaudited.length,
    gapsClosed: Number(gapsRow?.value ?? 0),
  };
}

export async function getProgressSummary(
  brandId: string,
  db: DbClient,
  organizationId: string,
  now: Date = new Date(),
): Promise<ProgressSummary> {
  return summaryFor(db, eq(remediationTasks.brandId, brandId), organizationId, now);
}

const EMPTY: ProgressSummary = {
  completedThisMonth: 0,
  openTasks: 0,
  totalTasks: 0,
  reaudits: { measured: 0, up: 0, down: 0, same: 0, notComparable: 0, latest: null },
  awaitingReaudit: 0,
  gapsClosed: 0,
};

export async function getOrgProgressSummary(
  orgId: string,
  now: Date = new Date(),
): Promise<ProgressSummary> {
  const accessibleBrands = await serviceDb
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.organizationId, orgId), isNull(brands.deletedAt)));
  const brandIds = accessibleBrands.map((b) => b.id);
  if (brandIds.length === 0) return EMPTY;
  return summaryFor(serviceDb, inArray(remediationTasks.brandId, brandIds), orgId, now);
}
