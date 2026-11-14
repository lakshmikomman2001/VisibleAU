// @vitest-environment jsdom
/**
 * 14 Nov, part 5 (Sri's review of audit #48): Hero's audit history drew #46's 0% (the name-matching bug) next to
 * #47's 27% and #48's 25%: a rise that never happened. An audit an operator excluded from trends is left off the
 * brand page's chart, and the note under it says which and why. Every audit excluded is not "no audits".
 */
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import { EARLIER_MENTION_CHECK_REASON } from "@/lib/audit/trend-exclusion";
import { visibilityDisplay } from "@/lib/scoring/visibility-display";

const BRAND = {
  id: "brand-1",
  name: "Hero Home Services",
  domain: "herohomeservices.com.au",
  vertical: "tradies",
  region: "au",
  competitors: [],
  primaryRegions: ["NSW:Yennora"],
};

function audit(auditNumber: number, score: string, day: number, excluded: string | null = null) {
  return {
    auditNumber,
    scoreComposite: score,
    completedAt: `2026-11-${String(day).padStart(2, "0")}T01:00:00.000Z`,
    methodologyVersion: 4,
    promptPackVersion: 3,
    excludedFromTrendsReason: excluded,
  };
}

function props(recentAudits: ReturnType<typeof audit>[]) {
  return {
    auditCount: recentAudits.length,
    recentAudits,
    // The headline card isn't what's tested here.
    latestAudit: {
      scoreComposite: recentAudits[0].scoreComposite,
      visibility: visibilityDisplay(null),
    },
    avgPosition: null,
    totalMentions: 12,
    engineStats: [],
    brand: BRAND,
  };
}

describe("the brand page's audit history leaves out an audit excluded from trends", () => {
  it("#46 excluded: two points (#47, #48), and the note names #46 and why", () => {
    render(
      <BrandDetailClient
        {...props([
          audit(48, "25", 14),
          audit(47, "27", 12),
          audit(46, "0", 10, EARLIER_MENTION_CHECK_REASON),
        ])}
      />,
    );
    expect(document.querySelectorAll("[data-spark-point]")).toHaveLength(2);
    const notes = [...document.querySelectorAll("[data-excluded-from-trends]")];
    expect(notes.map((n) => n.textContent)).toEqual([
      "Audit #46 is left out of this chart: measured with an earlier version of the mention check.",
    ]);
  });

  it("nothing excluded: every audit is a point and there's no note", () => {
    render(<BrandDetailClient {...props([audit(48, "25", 14), audit(47, "27", 12)])} />);
    expect(document.querySelectorAll("[data-spark-point]")).toHaveLength(2);
    expect(document.querySelector("[data-excluded-from-trends]")).toBeNull();
  });

  it("every audit excluded: says so, never 'No completed audits yet'", () => {
    const { container } = render(
      <BrandDetailClient {...props([audit(46, "0", 10, EARLIER_MENTION_CHECK_REASON)])} />,
    );
    expect(document.querySelectorAll("[data-spark-point]")).toHaveLength(0);
    expect(container).toHaveTextContent(
      "No audit to chart: every audit here is excluded from trends",
    );
    expect(container).not.toHaveTextContent("No completed audits yet");
  });
});
