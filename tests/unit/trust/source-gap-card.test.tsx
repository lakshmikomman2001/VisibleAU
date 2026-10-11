// @vitest-environment jsdom

/**
 * Task #43, Part C: "other" must render a neutral "Unclassified" badge,
 * never the green "Covered" badge GAP_CONFIG[source.gapSeverity] ??
 * GAP_CONFIG.covered would fall back to for any unrecognised
 * gapSeverity value if "unclassified" weren't an explicit entry.
 */
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { SourceGapCard } from "@/components/domain/trust/source-gap-card";

function baseSource(overrides: Partial<Parameters<typeof SourceGapCard>[0]["source"]> = {}) {
  return {
    id: "s1",
    engine: "perplexity",
    sourceType: "other",
    citationCount: 5,
    citationShare: "100",
    brandPresentInSource: false,
    gapSeverity: "unclassified",
    sourceAffinityNote: null,
    ...overrides,
  };
}

describe("SourceGapCard -- unclassified ('other') renders a neutral badge, not Covered or Critical", () => {
  it('renders "Unclassified", not "Covered" or "Critical gap"', () => {
    render(React.createElement(SourceGapCard, { source: baseSource() }));

    expect(screen.getByText("Unclassified")).toBeInTheDocument();
    expect(screen.queryByText("Covered")).not.toBeInTheDocument();
    expect(screen.queryByText("Critical gap")).not.toBeInTheDocument();
  });

  it("states the real share in the fallback note, not a generic line", () => {
    render(React.createElement(SourceGapCard, { source: baseSource({ citationShare: "75" }) }));

    expect(screen.getByText(/75% of this engine's cited sources/)).toBeInTheDocument();
  });
});

describe("SourceGapCard -- real categories still render their genuine severity", () => {
  it('a real category at critical severity still renders "Critical gap"', () => {
    render(
      React.createElement(SourceGapCard, {
        source: baseSource({
          sourceType: "au_directory",
          gapSeverity: "critical",
          citationShare: "40",
          sourceAffinityNote: "Australian directories are cited for contact details.",
        }),
      }),
    );

    expect(screen.getByText("Critical gap")).toBeInTheDocument();
    expect(screen.queryByText("Unclassified")).not.toBeInTheDocument();
  });

  it('brand present renders "Covered"', () => {
    render(
      React.createElement(SourceGapCard, {
        source: baseSource({
          sourceType: "review_site",
          gapSeverity: "covered",
          brandPresentInSource: true,
          sourceAffinityNote: "Review sites provide social proof.",
        }),
      }),
    );

    expect(screen.getByText("Covered")).toBeInTheDocument();
  });
});
