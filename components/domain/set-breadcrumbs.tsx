"use client";

import { useEffect } from "react";
import { useOverrideBreadcrumbs } from "./breadcrumb-context";

export function SetBreadcrumbs({ crumbs }: { crumbs: string[] }) {
  const { setOverrideCrumbs } = useOverrideBreadcrumbs();
  useEffect(() => {
    setOverrideCrumbs(crumbs);
    return () => setOverrideCrumbs(null);
  }, [crumbs, setOverrideCrumbs]);
  return null;
}
