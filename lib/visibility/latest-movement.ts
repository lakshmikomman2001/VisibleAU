import type { DriftBaselineReason } from "@/lib/drift/baseline";

/**
 * Why two audits aren't compared, in words (shared with lib/visibility/audit-change.ts, which every "before → after"
 * reads). Leftovers task, part 4 (17 Nov): latestMovement(), the portfolio page's only reader, went with that page;
 * the agency page's Top Movers and every other change use auditChanges().
 */
export type NotComparableReason = "engine_missing" | DriftBaselineReason;

const NOT_COMPARABLE_LABEL: Record<NotComparableReason, string> = {
  engine_missing: "Not comparable (an engine didn't answer)",
  // driftBaseline's reason when the earlier audit lost a whole engine.
  first_audit_no_comparison: "Not comparable (an engine didn't answer)",
  methodology_changed: "Not comparable (method changed)",
  // 15 Nov, part 2: the two audits asked different everyday questions (lib/audit/question-set.ts).
  questions_changed: "Not comparable (questions changed)",
  models_changed: "Not comparable (models changed)",
  model_drift: "Not comparable (a provider answered with another model)",
};

/** "Not comparable (questions changed)": the label for a reason (17 Nov, part 3: shared with lib/visibility/audit-change.ts). */
export function notComparableLabel(reason: NotComparableReason): string {
  return NOT_COMPARABLE_LABEL[reason];
}
