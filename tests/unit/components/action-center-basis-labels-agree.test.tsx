// @vitest-environment jsdom

/**
 * "Two wrong labels on the Action Center" (24 Oct), item 3 -- the right-hand pill and the meta
 * line render the same basis through the same function (displayBasisLabels), for every basis.
 */
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { ConfidenceBadge } from "@/components/domain/action-center/confidence-badge";
import { RecommendationCard } from "@/components/domain/action-center/recommendation-card";
import { type DisplayBasis, displayBasisLabels } from "@/lib/recommendations/confidence-labels";

const CREATED_AT = "2026-10-20T03:00:00.000Z";

const ITEM = {
  id: "item-1",
  title: "AI cited hipages in 9 of 40 answers — confirm your status, and 6 more directories",
  action: "Confirm your status on the Directory listings card.",
  confidenceLabel: "likely",
  expectedImpactScore: "high",
  evidenceRefs: [
    {
      source: "hipages",
      url: "https://hipages.com.au/connect/x",
      summary: "s",
      sourceType: "checker",
    },
  ],
  confidenceBasis: "verified",
  recommendationKey: "directory-visibility",
  createdAt: CREATED_AT,
};

const BASES: DisplayBasis[] = [
  "measured_citations",
  "owner_confirmed",
  "checked_source",
  "unverified",
];

describe("Action Center card -- pill and meta line agree for every basis (item 3)", () => {
  it.each(BASES)("%s", (basis) => {
    const { chip, text } = displayBasisLabels(basis, new Date(CREATED_AT));
    const { container } = render(
      <RecommendationCard item={{ ...ITEM, displayBasis: basis }} isFree={false} />,
    );
    const card = within(container);

    // The pill, rendered on its own, is exactly the card's pill.
    const { container: alone } = render(<ConfidenceBadge label={basis} />);
    expect(alone.textContent).toBe(chip);

    const pills = card.getAllByText(chip);
    const metas = card.getAllByText(text);
    expect(pills.length).toBeGreaterThan(0);
    expect(metas.length).toBeGreaterThan(0);
    // Every other basis's pill and meta text is absent from this card.
    for (const other of BASES.filter((b) => b !== basis)) {
      const o = displayBasisLabels(other, new Date(CREATED_AT));
      if (o.chip !== chip && o.chip !== text)
        expect(card.queryByText(o.chip)).not.toBeInTheDocument();
      if (o.text !== text && o.text !== chip)
        expect(card.queryByText(o.text)).not.toBeInTheDocument();
    }
  });

  it("a Measured card never says Confirmed or You told us", () => {
    render(
      <RecommendationCard item={{ ...ITEM, displayBasis: "measured_citations" }} isFree={false} />,
    );
    expect(screen.getByText("Measured")).toBeInTheDocument();
    expect(screen.getByText("Measured in this audit")).toBeInTheDocument();
    expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();
    expect(screen.queryByText("You told us")).not.toBeInTheDocument();
  });
});
