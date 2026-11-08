"use client";

import { useCallback, useState } from "react";
import { usePlanTier } from "@/components/domain/plan-tier-context";
import { type BrandFeature, brandFeatureLockedFor } from "@/lib/pricing/brand-features";
import { isPlanRefusal } from "@/lib/pricing/plan-refusal";

/**
 * 8 Nov (brand-feature locks, part 1; Sri: "no page shows a raw 403 or an empty error") -- the one way a
 * brand page decides whether to fetch a feature's data, and the one way it reads a refusal.
 *
 * - `locked` before anything is fetched: the workspace's plan (the (auth) layout's effectiveTier, through
 *   usePlanTier) doesn't have the feature. The page shows <PlanLockedCard feature=...> and makes no request.
 * - `planRefused(res)` in every fetch's handler: true when the server refused for the plan, which can still
 *   happen when the plan changed mid-session. The page then locks too, never an error or an empty state.
 *   A 403 for anything else (a role, a brand outside the workspace) isn't a plan refusal and stays the
 *   page's own error.
 */
export interface BrandFeatureGate {
  locked: boolean;
  planRefused: (res: Response) => Promise<boolean>;
}

export function useBrandFeatureGate(feature: BrandFeature): BrandFeatureGate {
  const tier = usePlanTier();
  const [refused, setRefused] = useState(false);
  const planRefused = useCallback(async (res: Response) => {
    if (!(await isPlanRefusal(res))) return false;
    setRefused(true);
    return true;
  }, []);
  return { locked: refused || brandFeatureLockedFor(tier, feature), planRefused };
}
