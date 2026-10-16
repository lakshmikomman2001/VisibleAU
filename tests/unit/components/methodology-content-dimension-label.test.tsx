// @vitest-environment jsdom

/**
 * Task #46 Phase 2, Part 0: the methodology page rendered a raw lowercase
 * `dimension` value ("accuracy", "frequency", ...) as a badge, uniformly
 * for all 5 dimensions -- flagged, not fixed, in Phase 1. Now routed
 * through the shared lib/scoring/dimension-labels.ts map, which also
 * carries the "Source citation" relabel for "accuracy".
 */
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { MethodologyContent } from "@/app/(marketing)/methodology/methodology-content";
import type { CitabilityMethod } from "@/lib/methodology/methods";

function method(overrides: Partial<CitabilityMethod>): CitabilityMethod {
  return {
    id: "m1",
    name: "Test method",
    dimension: "accuracy",
    effectSizeDelta: "+5pp",
    description: "desc",
    citation: "Some Source",
    effort: "low",
    ...overrides,
  };
}

describe("MethodologyContent — dimension badge uses the shared label map", () => {
  it('renders "Source citation" for dimension=accuracy, not the raw "accuracy"', () => {
    render(
      React.createElement(MethodologyContent, {
        remaining: [method({ dimension: "accuracy" })],
        total: 11,
      }),
    );
    fireEvent.click(screen.getByText(/Show all 11 methods/));
    expect(screen.getByText("Source citation")).toBeInTheDocument();
    expect(screen.queryByText("accuracy")).not.toBeInTheDocument();
  });

  it('renders "Frequency" (capitalised), not the raw lowercase "frequency"', () => {
    render(
      React.createElement(MethodologyContent, {
        remaining: [method({ dimension: "frequency" })],
        total: 11,
      }),
    );
    fireEvent.click(screen.getByText(/Show all 11 methods/));
    expect(screen.getByText("Frequency")).toBeInTheDocument();
    expect(screen.queryByText("frequency")).not.toBeInTheDocument();
  });
});
