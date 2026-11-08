import { fullyFailedEngines } from "@/lib/audit/engine-failure";
import type { AuditModelsOf } from "@/lib/audit/model-drift";
import { type DriftBaselineReason, driftBaseline } from "@/lib/drift/baseline";

/**
 * Mock-gate and retention follow-ups (9 Nov), part 5 -- the agency page's Top Movers and the portfolio's Trend
 * compared each brand's latest complete audit with the one before, whatever changed between them: a plan change
 * from Claude Haiku to Sonnet, Gemini 2.5 Flash to 3.5 Flash-Lite, a methodology change, a whole engine failing.
 * The difference was shown as the brand's movement. They now go through the drift baseline's rule
 * (lib/drift/baseline.ts: full engine coverage, the same methodology, the same models, no model drift, as the weekly
 * trend and the PDF use), with the same check on the latest audit's own coverage as detect-drift. When the two
 * aren't comparable the brand shows why, never a figure.
 */
export interface MovementAudit {
  id: string;
  engines: string[] | null;
  promptsCount: number | null;
  metadata: unknown;
  methodologyVersion: number | null;
}

export type NotComparableReason = "engine_missing" | DriftBaselineReason;

export type LatestMovement =
  | { kind: "none" }
  | { kind: "not_comparable"; reason: NotComparableReason; label: string }
  | { kind: "moved"; previous: number; latest: number; delta: number };

const NOT_COMPARABLE_LABEL: Record<NotComparableReason, string> = {
  engine_missing: "Not comparable (an engine didn't answer)",
  // driftBaseline's reason when the earlier audit lost a whole engine.
  first_audit_no_comparison: "Not comparable (an engine didn't answer)",
  methodology_changed: "Not comparable (method changed)",
  models_changed: "Not comparable (models changed)",
  model_drift: "Not comparable (a provider answered with another model)",
};

/** The movement between a brand's latest audit and the one before, or why there's none to show. */
export function latestMovement(input: {
  latest: MovementAudit | null;
  previous: MovementAudit | null;
  latestScore: number | null;
  previousScore: number | null;
  /** lib/audit/model-drift.ts auditModels() for both audits. */
  models: ReadonlyMap<string, AuditModelsOf>;
}): LatestMovement {
  const { latest, previous, latestScore, previousScore } = input;
  if (!latest || !previous || latestScore === null || previousScore === null)
    return { kind: "none" };
  if (fullyFailedEngines(latest).length > 0) return notComparable("engine_missing");
  const baseline = driftBaseline(latest, [previous], input.models);
  if (baseline.previous === null) return notComparable(baseline.reason);
  return {
    kind: "moved",
    previous: previousScore,
    latest: latestScore,
    delta: latestScore - previousScore,
  };
}

function notComparable(reason: NotComparableReason): LatestMovement {
  return { kind: "not_comparable", reason, label: NOT_COMPARABLE_LABEL[reason] };
}
