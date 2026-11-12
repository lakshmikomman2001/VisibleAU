// @vitest-environment jsdom
/**
 * 13 Nov (Sri's walk-through, part 3): a brand with no audits showed four grey placeholder cards that never
 * finished loading -- nothing was loading. Each card says "No audits yet" and what it will show; when the
 * figures couldn't be loaded, the shared error with Try again, never "No audits yet" (that would be untrue).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";

const BRAND = {
  id: "brand-1",
  name: "Hero Home Services",
  domain: "herohomeservices.com.au",
  vertical: "tradies",
  region: "au",
  competitors: [],
  primaryRegions: ["NSW:Yennora"],
};
const NONE = {
  auditCount: 0,
  recentAudits: [],
  latestAudit: null,
  avgPosition: null,
  totalMentions: 0,
  engineStats: [],
};

describe("a brand with no audits", () => {
  it("four real cards, each saying what it will show -- no placeholder", () => {
    render(<BrandDetailClient {...NONE} brand={BRAND} />);
    const cards = [...document.querySelectorAll("[data-brand-kpis] > div")];
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => c.textContent)).toEqual([
      "VisibilityNo audits yetHow often AI answers name you, after your first audit",
      "Typical positionNo audits yetYour usual place when AI lists businesses",
      "Total mentionsNo audits yetAnswers that name your business, across your audits",
      "SentimentNot yet measured",
    ]);
    for (const card of cards) expect(card.textContent?.trim()).not.toBe("");
    expect(screen.getByText("Run your first audit to see engine scores.")).toBeInTheDocument();
  });

  it("figures that couldn't be loaded: the shared error with Try again, and no 'No audits yet'", () => {
    router.refresh.mockClear();
    render(<BrandDetailClient {...NONE} statsUnavailable brand={BRAND} />);
    const error = document.querySelector("[data-brand-stats-error]");
    expect(error).toHaveTextContent(/this brand's audit figures/);
    expect(document.querySelector("[data-brand-kpis]")).toBeNull();
    expect(screen.queryByText("No audits yet")).toBeNull();
    expect(screen.queryByText("Run your first audit to see engine scores.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // The brand itself still shows: its name and its settings.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hero Home Services");
    expect(screen.getByText("Brand settings")).toBeInTheDocument();
  });
});
