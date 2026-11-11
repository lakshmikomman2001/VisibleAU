"use client";

import { type EventData, Joyride, type Step } from "react-joyride";
import { themeColour } from "@/lib/theme/theme-colour";

const TOUR_STEPS: Step[] = [
  {
    target: '[data-tour="sidebar"]',
    content: "Your brands, audits, and insights live here",
    skipBeacon: true,
  },
  {
    target: '[data-tour="kpi-cards"]',
    content: "Track your visibility score over time",
  },
  {
    target: '[data-tour="action-center"]',
    content: "We turn audits into specific recommendations",
  },
];

export function ProductTour({ onComplete }: { onComplete: () => void }) {
  const handleEvent = (data: EventData) => {
    if (data.status === "finished" || data.status === "skipped") {
      onComplete();
    }
  };

  return (
    <Joyride
      steps={TOUR_STEPS}
      run
      continuous
      options={{
        buttons: ["back", "close", "primary", "skip"],
        primaryColor: themeColour("--accent-blue"),
        zIndex: 10000,
      }}
      onEvent={handleEvent}
    />
  );
}
