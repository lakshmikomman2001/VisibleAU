"use client";

import { useEffect } from "react";
import { useOverrideCurrentBrand } from "./current-brand-context";

/**
 * Task #46 Phase 2, Part 0: declares the active brand for pages that
 * are brand-scoped but don't live under /brands/[id] -- e.g.
 * /audits/[auditId] -- so WorkspaceSwitcher shows the real brand name
 * instead of falling back to "Select brand". Mirrors SetBreadcrumbs.
 */
export function SetCurrentBrand({ brandId }: { brandId: string }) {
  const { setOverrideBrandId } = useOverrideCurrentBrand();
  useEffect(() => {
    setOverrideBrandId(brandId);
    return () => setOverrideBrandId(null);
  }, [brandId, setOverrideBrandId]);
  return null;
}
