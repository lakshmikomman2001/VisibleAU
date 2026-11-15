import { inArray } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits } from "@/db/schema";
import { fullyFailedEngines } from "@/lib/audit/engine-failure";
import { auditsCountingGoogle } from "@/lib/audit/google-surfaces/summary";
import { auditModels } from "@/lib/audit/model-drift";
import { isExcludedFromTrends } from "@/lib/audit/trend-exclusion";
import { driftBaseline } from "@/lib/drift/baseline";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";
import { visibilityDisplay } from "@/lib/scoring/visibility-display";
import { notComparableLabel } from "@/lib/visibility/latest-movement";

/**
 * 17 Nov, part 3 -- the change in Visibility between two audits, as the audit page shows each one: "Audit #48 → #52:
 * 25% (10 of 40) → 33% (13 of 40), up 8 points". One function for every "before → after" a page shows: a task's
 * re-audit (the task card, Autopilot's step 5, the dashboard's measured impact) and a brand's latest movement.
 *
 * It replaces a "before" that was never measured: a recommendation task's score_before is its expected-impact
 * bucket (80, 50 or 20: lib/workflow/task-manager.ts IMPACT_TO_SCORE), and the task card drew "80 → 33" and the
 * dashboard "Citation rate improved +12.3% · verified by re-audit" from it. Here both figures are audits' own
 * (resolveOrganicDimensions + visibilityDisplay), the change is between the two figures as shown (so "25% → 25%" is
 * no change), and two audits are compared only when the drift baseline's rule allows it (the same method,
 * questions and models, no model drift, every engine answered, Google counted alike: lib/drift/baseline.ts) and
 * neither is excluded from trends. Otherwise it says why, never a figure.
 */

export interface AuditFigure {
  auditId: string;
  auditNumber: number;
  completedAt: string | null;
  /** "33%" */
  value: string;
  /** "13 of 40" */
  counts: string;
  /** The rounded percentage the value shows. */
  shownPercent: number;
}

export type AuditChange =
  | { kind: "not_measured"; reason: string }
  | {
      kind: "not_comparable";
      reason: string;
      before: AuditFigure | null;
      after: AuditFigure | null;
    }
  | {
      kind: "measured";
      before: AuditFigure;
      after: AuditFigure;
      /** after − before, in the shown percentage points. */
      points: number;
      direction: "up" | "down" | "same";
      /** "Audit #48 → #52: 25% (10 of 40) → 33% (13 of 40), up 8 points" */
      line: string;
    };

export interface AuditPair {
  key: string;
  beforeId: string | null;
  afterId: string | null;
}

function figureLine(f: AuditFigure): string {
  return `${f.value} (${f.counts})`;
}

function pointsWords(points: number): string {
  if (points === 0) return "no change";
  const n = Math.abs(points);
  return `${points > 0 ? "up" : "down"} ${n} ${n === 1 ? "point" : "points"}`;
}

/** The change for each pair (batched: one query per kind for every audit involved). */
export async function auditChanges(
  tx: DbClient,
  pairs: readonly AuditPair[],
): Promise<Map<string, AuditChange>> {
  const result = new Map<string, AuditChange>();
  const ids = [
    ...new Set(pairs.flatMap((p) => [p.beforeId, p.afterId]).filter((id): id is string => !!id)),
  ];
  const rows =
    ids.length === 0
      ? []
      : await tx
          .select({
            id: audits.id,
            auditNumber: audits.auditNumber,
            status: audits.status,
            completedAt: audits.completedAt,
            engines: audits.engines,
            promptsCount: audits.promptsCount,
            metadata: audits.metadata,
            methodologyVersion: audits.methodologyVersion,
            questionSetHash: audits.questionSetHash,
            promptPackVersion: audits.promptPackVersion,
            excludedFromTrendsReason: audits.excludedFromTrendsReason,
          })
          .from(audits)
          .where(inArray(audits.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const complete = rows.filter((r) => r.status === "complete").map((r) => r.id);
  const [resolved, models, countsGoogle] = await Promise.all([
    resolveOrganicDimensions(tx, complete),
    auditModels(tx, complete),
    auditsCountingGoogle(tx, complete),
  ]);

  const figure = (id: string): AuditFigure | null => {
    const row = byId.get(id);
    const r = resolved.get(id);
    if (row?.status !== "complete" || r?.headline.status !== "scored") return null;
    const shown = visibilityDisplay(r);
    return {
      auditId: id,
      auditNumber: row.auditNumber,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      value: shown.value,
      counts: shown.detail,
      // The percentage as shown ("33%" -> 33), so the change is between the figures a reader sees.
      shownPercent: Number.parseInt(shown.value, 10),
    };
  };

  for (const pair of pairs) {
    const beforeRow = pair.beforeId ? byId.get(pair.beforeId) : undefined;
    const afterRow = pair.afterId ? byId.get(pair.afterId) : undefined;
    if (!beforeRow) {
      result.set(pair.key, {
        kind: "not_measured",
        reason: "No audit before this to compare with",
      });
      continue;
    }
    if (afterRow?.status !== "complete") {
      result.set(pair.key, { kind: "not_measured", reason: "Not re-audited yet" });
      continue;
    }
    const before = figure(beforeRow.id);
    const after = figure(afterRow.id);
    if (!before || !after) {
      const short = !before ? beforeRow : afterRow;
      result.set(pair.key, {
        kind: "not_measured",
        reason: `Not measured: audit #${short.auditNumber} had too few answers`,
      });
      continue;
    }
    const excluded = [beforeRow, afterRow].find((a) => isExcludedFromTrends(a));
    if (excluded) {
      result.set(pair.key, {
        kind: "not_comparable",
        reason: `Not comparable (audit #${excluded.auditNumber} is excluded from trends)`,
        before,
        after,
      });
      continue;
    }
    if (fullyFailedEngines(afterRow).length > 0) {
      result.set(pair.key, {
        kind: "not_comparable",
        reason: notComparableLabel("engine_missing"),
        before,
        after,
      });
      continue;
    }
    const baseline = driftBaseline(afterRow, [beforeRow], models, countsGoogle);
    if (baseline.previous === null) {
      result.set(pair.key, {
        kind: "not_comparable",
        reason: notComparableLabel(baseline.reason),
        before,
        after,
      });
      continue;
    }
    const points = after.shownPercent - before.shownPercent;
    result.set(pair.key, {
      kind: "measured",
      before,
      after,
      points,
      direction: points > 0 ? "up" : points < 0 ? "down" : "same",
      line: `Audit #${before.auditNumber} → #${after.auditNumber}: ${figureLine(before)} → ${figureLine(after)}, ${pointsWords(points)}`,
    });
  }
  return result;
}
