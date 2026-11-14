"use client";

import { createContext, useContext, useState } from "react";
import type { BreadcrumbBrand, Breadcrumbs } from "@/lib/navigation/breadcrumbs";

const BreadcrumbContext = createContext<{
  overrideCrumbs: Breadcrumbs | null;
  setOverrideCrumbs: (crumbs: Breadcrumbs | null) => void;
  /** 14 Nov, part 6: the brand whose pages are open (set by app/(auth)/brands/[brandId]/layout.tsx). */
  brand: BreadcrumbBrand | null;
  setBrand: (brand: BreadcrumbBrand | null) => void;
}>({ overrideCrumbs: null, setOverrideCrumbs: () => {}, brand: null, setBrand: () => {} });

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [overrideCrumbs, setOverrideCrumbs] = useState<Breadcrumbs | null>(null);
  const [brand, setBrand] = useState<BreadcrumbBrand | null>(null);
  return (
    <BreadcrumbContext value={{ overrideCrumbs, setOverrideCrumbs, brand, setBrand }}>
      {children}
    </BreadcrumbContext>
  );
}

export function useOverrideBreadcrumbs() {
  return useContext(BreadcrumbContext);
}
