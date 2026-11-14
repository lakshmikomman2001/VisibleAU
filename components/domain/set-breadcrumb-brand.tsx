"use client";

import { useEffect } from "react";
import type { BreadcrumbBrand } from "@/lib/navigation/breadcrumbs";
import { useOverrideBreadcrumbs } from "./breadcrumb-context";

/**
 * 14 Nov, part 6 (Sri: /brands/[id]/reports said "Workspace / Brands / Brand / Reports"): the brand layout names
 * the brand once, for every page under it; the breadcrumb then reads "Hero Home Services", not "Brand". A page
 * that names its own breadcrumb (SetBreadcrumbs) still wins.
 */
export function SetBreadcrumbBrand({ brand }: { brand: BreadcrumbBrand }) {
  const { setBrand } = useOverrideBreadcrumbs();
  const { id, name } = brand;
  useEffect(() => {
    setBrand({ id, name });
    return () => setBrand(null);
  }, [id, name, setBrand]);
  return null;
}
