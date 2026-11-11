import { fullyFailedEngines } from "@/lib/audit/engine-failure";
import type { AuditModelsOf } from "@/lib/audit/model-drift";
import { sameModelSet } from "@/lib/llm/model-set";

type Candidate = Parameters<typeof fullyFailedEngines>[0] & {
  id: string;
  methodologyVersion: number | null;
};

export type DriftBaselineReason =
  | "first_audit_no_comparison"
  | "methodology_changed"
  | "models_changed"
  | "model_drift";

export type DriftBaseline<T> =
  | { previous: T; reason: null }
  | { previous: null; reason: DriftBaselineReason };

/**
 * The audit a new one's drift is measured against: the latest earlier complete audit (candidates newest
 * first) in which every engine answered -- one that lost a whole engine isn't like for like (URGENT audit
 * #37, 31 Oct, item 2) -- and that ran under the same methodology. "Mention detection" (6 Nov), part 6: a
 * methodology change is treated like a partial audit, never compared -- a v2.1 audit's mentions include ones
 * v2's detection missed, and comparing them would report the detection change as drift.
 *
 * Methodology v2.2 (Sri's decision, 7 Nov), part 3: and that asked the same engines for the same models
 * (`models`, lib/audit/model-drift.ts's auditModels, holds both audits' sets) -- a plan change from Claude
 * Haiku to Sonnet, or Gemini 2.5 Flash to 3.5 Flash-Lite, would report the model change as drift. An audit a
 * provider answered with another model (model drift) is never compared, as the new audit or as its baseline.
 * The reason says which rule left nothing to compare with. Shared by inngest/functions/detect-drift.ts and
 * lib/audit/run-audit-inline.ts.
 */
export function driftBaseline<T extends Candidate>(
  current: { id: string; methodologyVersion: number | null },
  candidates: T[],
  models: ReadonlyMap<string, AuditModelsOf>,
  /** Google AI surfaces (Phase 1): the audits that counted Google in their headline (off by default). An
   * audit is never compared with one that counted it differently -- a different headline basis, so
   * "methodology_changed". Omitted: no audit counted it. */
  countsGoogle: ReadonlySet<string> = new Set(),
): DriftBaseline<T> {
  const drifted = (id: string) => (models.get(id)?.drift.length ?? 0) > 0;
  if (drifted(current.id)) return { previous: null, reason: "model_drift" };
  const full = candidates.filter((a) => fullyFailedEngines(a).length === 0);
  if (full.length === 0) return { previous: null, reason: "first_audit_no_comparison" };
  const sameMethodology = full.filter(
    (a) => (a.methodologyVersion ?? 1) === (current.methodologyVersion ?? 1),
  );
  if (sameMethodology.length === 0) return { previous: null, reason: "methodology_changed" };
  const sameModels = sameMethodology.filter((a) =>
    sameModelSet(models.get(a.id)?.models, models.get(current.id)?.models),
  );
  if (sameModels.length === 0) return { previous: null, reason: "models_changed" };
  const sameBasis = sameModels.filter(
    (a) => countsGoogle.has(a.id) === countsGoogle.has(current.id),
  );
  if (sameBasis.length === 0) return { previous: null, reason: "methodology_changed" };
  const previous = sameBasis.find((a) => !drifted(a.id));
  return previous ? { previous, reason: null } : { previous: null, reason: "model_drift" };
}
