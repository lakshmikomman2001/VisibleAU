// @vitest-environment jsdom

/**
 * Task #46 Phase 2, Part 0 routed the methodology cards' dimension badge through lib/scoring/dimension-labels.ts.
 * 19 Nov (Sri's review): the cards carry no dimension badge any more -- four said "Context", which is "Not scored"
 * everywhere else, and none of the studies behind the methods measured the dimensions we score. Each card shows its
 * effect, its effort and its source.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { MethodologyContent } from "@/app/(marketing)/methodology/methodology-content";
import type { CitabilityMethod } from "@/lib/methodology/methods";
import { DIMENSION_LABELS } from "@/lib/scoring/dimension-labels";

function method(overrides: Partial<CitabilityMethod>): CitabilityMethod {
  return {
    id: "m1",
    name: "Test method",
    effectSizeDelta: "+5pp",
    description: "desc",
    citation: "Some Source",
    effort: "low",
    ...overrides,
  };
}

describe("MethodologyContent — no dimension badge on a method", () => {
  it("shows the effect, the effort and the source, and no dimension label", () => {
    render(
      React.createElement(MethodologyContent, {
        remaining: [method({ citation: "Aggarwal et al." })],
        total: 11,
      }),
    );
    fireEvent.click(screen.getByText(/Show all 11 methods/));
    expect(screen.getByText("+5pp")).toBeInTheDocument();
    expect(screen.getByText("Effort: low")).toBeInTheDocument();
    expect(screen.getByText("Aggarwal et al.")).toBeInTheDocument();
    for (const label of Object.values(DIMENSION_LABELS)) {
      expect(screen.queryByText(label), label).not.toBeInTheDocument();
    }
  });
});
