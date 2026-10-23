// @vitest-environment jsdom
/**
 * Vunnara Build 1 addendum, item 1 -- live on Bondi Audit #8 (18 Oct),
 * a legacy recommendation's title still stated the claim as fact and
 * its priority badge stayed a plain red "High", with "not verified"
 * only appearing in a small secondary line. This proves the fix: a
 * legacy row (no confidenceBasis) renders a "Check: " title and a
 * muted "<Impact> · unverified" badge instead; an evidence-backed row
 * is unchanged.
 */
import { render, screen } from "@testing-library/react";
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

vi.mock("lucide-react", () => ({
  ChevronRight: (props: Record<string, unknown>) => <span data-testid="chevron" {...props} />,
}));

import { RecommendationCard } from "@/components/domain/action-center/recommendation-card";

const BASE_ITEM = {
  id: "item-1",
  title: "Your AU local directory listings are incomplete",
  action: "Submit your business to hipages, Yellow Pages AU, ServiceSeeking.",
  confidenceLabel: "confirmed",
  expectedImpactScore: "high",
  evidenceRefs: [],
  recommendationKey: "directory-visibility",
  createdAt: "2026-10-18T00:00:00.000Z",
};

describe("RecommendationCard -- legacy rows read as a check, not a settled claim (Build 1 addendum, item 1)", () => {
  it("a legacy row (no confidenceBasis) shows the Check: title and a muted 'High · unverified' badge", () => {
    render(<RecommendationCard item={{ ...BASE_ITEM, confidenceBasis: null }} isFree={false} />);
    expect(
      screen.getByText("Check: Your AU local directory listings are incomplete"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Your AU local directory listings are incomplete")).not.toBeInTheDocument();
    expect(screen.getByText("High · unverified")).toBeInTheDocument();
    expect(screen.queryByText("High")).not.toBeInTheDocument();
  });

  it("an evidence-backed row (confidenceBasis: 'verified') shows the title as-is and a plain 'High' badge", () => {
    render(<RecommendationCard item={{ ...BASE_ITEM, confidenceBasis: "verified" }} isFree={false} />);
    expect(
      screen.getByText("Your AU local directory listings are incomplete"),
    ).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.queryByText(/^Check:/)).not.toBeInTheDocument();
    expect(screen.queryByText("High · unverified")).not.toBeInTheDocument();
  });

  it("the legacy badge uses the muted token, never the real impact color", () => {
    render(<RecommendationCard item={{ ...BASE_ITEM, confidenceBasis: null }} isFree={false} />);
    const badge = screen.getByText("High · unverified");
    expect(badge.style.background).toBe("var(--accent-muted)");
    expect(badge.style.color).toBe("var(--text-tertiary)");
  });

  it("an evidence-backed row's badge keeps the real high-impact danger color", () => {
    render(<RecommendationCard item={{ ...BASE_ITEM, confidenceBasis: "verified" }} isFree={false} />);
    const badge = screen.getByText("High");
    expect(badge.style.background).toBe("var(--danger-soft)");
    expect(badge.style.color).toBe("var(--danger)");
  });
});
