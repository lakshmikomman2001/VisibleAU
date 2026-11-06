import { fullyFailedEngines } from "@/lib/audit/engine-failure";

type Candidate = Parameters<typeof fullyFailedEngines>[0] & { methodologyVersion: number | null };

export type DriftBaseline<T> =
  | { previous: T; reason: null }
  | { previous: null; reason: "first_audit_no_comparison" | "methodology_changed" };

/**
 * The audit a new one's drift is measured against: the latest earlier complete audit (candidates newest
 * first) in which every engine answered -- one that lost a whole engine isn't like for like (URGENT audit
 * #37, 31 Oct, item 2) -- and that ran under the same methodology. "Mention detection" (6 Nov), part 6: a
 * methodology change is treated like a partial audit, never compared -- a v2.1 audit's mentions include ones
 * v2's detection missed, and comparing them would report the detection change as drift. Shared by
 * inngest/functions/detect-drift.ts and lib/audit/run-audit-inline.ts.
 */
export function driftBaseline<T extends Candidate>(
  current: { methodologyVersion: number | null },
  candidates: T[],
): DriftBaseline<T> {
  const full = candidates.filter((a) => fullyFailedEngines(a).length === 0);
  const previous = full.find(
    (a) => (a.methodologyVersion ?? 1) === (current.methodologyVersion ?? 1),
  );
  if (previous) return { previous, reason: null };
  return {
    previous: null,
    reason: full.length > 0 ? "methodology_changed" : "first_audit_no_comparison",
  };
}
