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
    topDomains: null,
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

describe("SourceGapCard -- new category labels (task #46)", () => {
  it('renders "Industry body" for industry_association, not "industry association"', () => {
    render(
      React.createElement(SourceGapCard, {
        source: baseSource({ sourceType: "industry_association", gapSeverity: "opportunity" }),
      }),
    );
    expect(screen.getByText("Industry body")).toBeInTheDocument();
  });

  it('renders "Regulator / government" for government_regulator', () => {
    render(
      React.createElement(SourceGapCard, {
        source: baseSource({ sourceType: "government_regulator", gapSeverity: "opportunity" }),
      }),
    );
    expect(screen.getByText("Regulator / government")).toBeInTheDocument();
  });
});

describe("SourceGapCard -- top cited domains (task #45)", () => {
  it('shows the "appear after the next audit" fallback when topDomains is null', () => {
    render(React.createElement(SourceGapCard, { source: baseSource({ topDomains: null }) }));

    expect(screen.getByText("Top domains appear after the next audit.")).toBeInTheDocument();
    expect(screen.queryByText("Top cited domains")).not.toBeInTheDocument();
  });

  it("renders nothing further when topDomains is a genuinely-computed empty array", () => {
    render(React.createElement(SourceGapCard, { source: baseSource({ topDomains: [] }) }));

    expect(screen.queryByText("Top domains appear after the next audit.")).not.toBeInTheDocument();
    expect(screen.queryByText("Top cited domains")).not.toBeInTheDocument();
  });

  it("a retrieved domain renders as a safe, new-tab link with the hardened rel", () => {
    render(
      React.createElement(SourceGapCard, {
        source: baseSource({
          topDomains: [{ domain: "hipages.com.au", count: 3, origin: "retrieved" }],
        }),
      }),
    );

    const link = screen.getByRole("link", { name: /hipages\.com\.au/ });
    expect(link).toHaveAttribute("href", "https://hipages.com.au/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(screen.getByText("Retrieved")).toBeInTheDocument();
  });

  // Task #46 Part C: retrieved links previously looked identical to
  // plain recalled text -- a visible icon + accessible label now
  // distinguishes them regardless of hover/focus state.
  it("a retrieved link has a visible external-link icon and an 'opens in new tab' accessible label", () => {
    render(
      React.createElement(SourceGapCard, {
        source: baseSource({
          topDomains: [{ domain: "hipages.com.au", count: 3, origin: "retrieved" }],
        }),
      }),
    );

    const link = screen.getByRole("link", { name: /hipages\.com\.au \(opens in new tab\)/ });
    expect(link.querySelector("svg")).toBeInTheDocument();
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(link.className).toContain("underline");
  });

  it("a recalled entry has neither a link role nor the external-link icon", () => {
    const { container } = render(
      React.createElement(SourceGapCard, {
        source: baseSource({
          topDomains: [{ domain: "someplumber.com.au", count: 2, origin: "recalled" }],
        }),
      }),
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("a recalled domain renders as plain text, never a link", () => {
    render(
      React.createElement(SourceGapCard, {
        source: baseSource({
          topDomains: [{ domain: "someplumber.com.au", count: 2, origin: "recalled" }],
        }),
      }),
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("someplumber.com.au")).toBeInTheDocument();
    const badge = screen.getByText("Recalled");
    expect(badge).toHaveAttribute(
      "title",
      "Domains the model wrote from memory, not verified by a live search — may be outdated or invented.",
    );
  });

  it("a mixed card shows both counts in the label and only links the retrieved domain", () => {
    render(
      React.createElement(SourceGapCard, {
        source: baseSource({
          topDomains: [
            { domain: "hipages.com.au", count: 3, origin: "retrieved" },
            { domain: "someplumber.com.au", count: 2, origin: "recalled" },
          ],
        }),
      }),
    );

    expect(screen.getByText("Retrieved (1) + Recalled (1)")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /hipages\.com\.au/ })).toBeInTheDocument();
    expect(screen.getByText("someplumber.com.au")).toBeInTheDocument();
  });

  it("flags the brand's own domain with a visible badge", () => {
    render(
      React.createElement(SourceGapCard, {
        source: baseSource({
          topDomains: [{ domain: "bondiplumbing.com.au", count: 1, origin: "recalled", isBrand: true }],
        }),
      }),
    );

    expect(screen.getByText("this brand")).toBeInTheDocument();
  });

  it("a retrieved-origin entry with a javascript: domain never becomes a link", () => {
    render(
      React.createElement(SourceGapCard, {
        source: baseSource({
          topDomains: [
            { domain: "javascript:alert(1)", count: 1, origin: "retrieved" },
          ],
        }),
      }),
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
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
