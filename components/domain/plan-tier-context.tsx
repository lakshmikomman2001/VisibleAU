"use client";

import { createContext, useContext } from "react";

/**
 * 6 Nov -- the workspace's plan for client components that show a lock on a paid
 * feature's entry (components/domain/pricing/plan-lock.tsx). The (auth) layout reads it
 * with effectiveTier(), the same read every server gate makes. Null outside the layout.
 */
const PlanTierContext = createContext<string | null>(null);

export function PlanTierProvider({ tier, children }: { tier: string; children: React.ReactNode }) {
  return <PlanTierContext.Provider value={tier}>{children}</PlanTierContext.Provider>;
}

export function usePlanTier(): string | null {
  return useContext(PlanTierContext);
}
