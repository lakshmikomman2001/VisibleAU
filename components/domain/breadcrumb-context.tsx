"use client";

import { createContext, useContext, useState } from "react";
import type { Breadcrumbs } from "@/lib/navigation/breadcrumbs";

const BreadcrumbContext = createContext<{
  overrideCrumbs: Breadcrumbs | null;
  setOverrideCrumbs: (crumbs: Breadcrumbs | null) => void;
}>({ overrideCrumbs: null, setOverrideCrumbs: () => {} });

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [overrideCrumbs, setOverrideCrumbs] = useState<Breadcrumbs | null>(null);
  return (
    <BreadcrumbContext value={{ overrideCrumbs, setOverrideCrumbs }}>{children}</BreadcrumbContext>
  );
}

export function useOverrideBreadcrumbs() {
  return useContext(BreadcrumbContext);
}
