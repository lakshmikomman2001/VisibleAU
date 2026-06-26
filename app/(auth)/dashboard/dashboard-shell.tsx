"use client";

import { type ReactNode, useState } from "react";
import { ProductTour } from "@/components/domain/onboarding/product-tour";

export function DashboardShell({
  showTour,
  children,
}: {
  showTour: boolean;
  children: ReactNode;
}) {
  const [tourActive, setTourActive] = useState(showTour);

  const handleTourComplete = async () => {
    setTourActive(false);
    await fetch("/api/onboarding/tour-complete", { method: "POST" });
  };

  return (
    <>
      {tourActive && <ProductTour onComplete={handleTourComplete} />}
      {children}
    </>
  );
}
