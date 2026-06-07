"use client";

import { createContext, useContext, useState } from "react";

const BreadcrumbContext = createContext<{
  overrideCrumbs: string[] | null;
  setOverrideCrumbs: (crumbs: string[] | null) => void;
}>({ overrideCrumbs: null, setOverrideCrumbs: () => {} });

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [overrideCrumbs, setOverrideCrumbs] = useState<string[] | null>(null);
  return (
    <BreadcrumbContext value={{ overrideCrumbs, setOverrideCrumbs }}>
      {children}
    </BreadcrumbContext>
  );
}

export function useOverrideBreadcrumbs() {
  return useContext(BreadcrumbContext);
}
