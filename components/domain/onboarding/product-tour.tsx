"use client";

import { Joyride, type Step, type EventData } from "react-joyride";

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
        primaryColor: "#3b82f6",
        zIndex: 10000,
      }}
      onEvent={handleEvent}
    />
  );
}
