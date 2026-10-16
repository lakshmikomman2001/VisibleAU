"use client";

import { createContext, useContext, useState } from "react";

/**
 * Task #46 Phase 2, Part 0: mirrors breadcrumb-context.tsx's own
 * "set from a page below, read from the topbar sibling above" pattern.
 * AppTopbar (and the WorkspaceSwitcher inside it) is a sibling of
 * `{children}` in app/(auth)/layout.tsx, not a parent of it, so a page
 * can't just pass its brand down as a prop -- it declares the active
 * brand through this context instead, the same way SetBreadcrumbs
 * declares the active breadcrumb trail.
 */
const CurrentBrandContext = createContext<{
  overrideBrandId: string | null;
  setOverrideBrandId: (brandId: string | null) => void;
}>({ overrideBrandId: null, setOverrideBrandId: () => {} });

export function CurrentBrandProvider({ children }: { children: React.ReactNode }) {
  const [overrideBrandId, setOverrideBrandId] = useState<string | null>(null);
  return (
    <CurrentBrandContext value={{ overrideBrandId, setOverrideBrandId }}>
      {children}
    </CurrentBrandContext>
  );
}

export function useOverrideCurrentBrand() {
  return useContext(CurrentBrandContext);
}
