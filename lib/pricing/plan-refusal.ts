import { getTierDefinition } from "./tiers";

/**
 * 8 Nov (brand-feature locks and pricing claims, part 1) -- the one answer a route gives when the
 * workspace's plan doesn't have what it asked for, and the one way a page reads it. A 403 alone can't
 * say that: a role refusal or a brand outside the workspace is a 403 too. The `code` does, so a page
 * shows its locked card for a plan refusal and nothing else (useBrandFeatureGate,
 * components/domain/pricing/brand-feature-gate.ts).
 */
export const PLAN_REQUIRED = "plan_required";

export interface PlanRefusalBody {
  error: string;
  code: typeof PLAN_REQUIRED;
  /** The lowest plan with it, a tiers.ts key. */
  plan: string;
}

/** `{ error: "This is part of the Growth plan", code: "plan_required", plan: "growth" }`. */
export function planRefusalBody(planKey: string): PlanRefusalBody {
  const name = getTierDefinition(planKey)?.name ?? planKey;
  return { error: `This is part of the ${name} plan`, code: PLAN_REQUIRED, plan: planKey };
}

/** Whether a response is a plan refusal. Reads a copy, so the caller can still read the body. */
export async function isPlanRefusal(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body: unknown = await res.clone().json();
    return (
      typeof body === "object" && body !== null && "code" in body && body.code === PLAN_REQUIRED
    );
  } catch {
    return false;
  }
}
