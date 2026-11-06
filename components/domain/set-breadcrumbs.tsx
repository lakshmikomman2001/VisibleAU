"use client";

import { useEffect } from "react";
import type { Breadcrumbs } from "@/lib/navigation/breadcrumbs";
import { useOverrideBreadcrumbs } from "./breadcrumb-context";

/** A page names its own breadcrumb, e.g. a brand's name: each parent with its href. */
export function SetBreadcrumbs({ crumbs }: { crumbs: Breadcrumbs }) {
  const { setOverrideCrumbs } = useOverrideBreadcrumbs();
  useEffect(() => {
    setOverrideCrumbs(crumbs);
    return () => setOverrideCrumbs(null);
  }, [crumbs, setOverrideCrumbs]);
  return null;
}
