// @vitest-environment jsdom

/**
 * Live bug (723f28c): the Hallucination Incidents not-measured card
 * rendered "Hallucination detectionchecking hasn't been built yet" --
 * no space between the metric label and "checking". The JSX source
 * literally had a space character ({metric} checking ...), but because
 * that text continued onto further lines, JSX's per-line whitespace
 * trimming dropped the leading space of the first line once the text
 * node spanned multiple source lines. A plain source-string match
 * (`toContain("checking")`) would NOT have caught this -- the bug only
 * shows up in the actual rendered DOM, so this test renders the real
 * component instead of grepping its source.
 */
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { NotYetMeasuredCard } from "@/components/domain/trust/not-yet-measured-card";

// The real metric labels every stub tile passes in production.
const REAL_METRIC_LABELS = [
  "Hallucination detection",
  "LinkedIn presence",
  "YouTube presence",
  "Cross-platform consensus",
  "Knowledge Panel",
  "Wikidata",
];

describe("NotYetMeasuredCard -- renders a correctly-spaced, grammatical sentence for every stub tile", () => {
  for (const metric of REAL_METRIC_LABELS) {
    it(`"${metric}" renders with no word concatenated together`, () => {
      render(React.createElement(NotYetMeasuredCard, { metric }));

      // Matches the full expected sentence, including the space between
      // the metric label and "hasn't" -- if JSX ever drops that space
      // again, no element's text content will match this and the query
      // throws, failing the test.
      expect(
        screen.getByText(
          `${metric} hasn't been built yet — this tile will populate once it ships. No score has been measured.`,
        ),
      ).toBeInTheDocument();
    });
  }

  it('the live bug (723f28c) is fixed: "Hallucination detection" never renders as "detectionchecking"', () => {
    render(React.createElement(NotYetMeasuredCard, { metric: "Hallucination detection" }));
    const card = screen.getByText(/hasn't been built yet/);
    expect(card.textContent).not.toContain("detectionchecking");
    expect(card.textContent).not.toContain("checking");
    expect(card.textContent).toContain("Hallucination detection hasn't been built yet");
  });
});
