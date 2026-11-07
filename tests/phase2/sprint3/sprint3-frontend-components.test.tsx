// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { SovLine, SovPayload } from "@/lib/visibility/share-of-voice-display";

// ─── MOCKS ──────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/brands/test/visibility",
}));

// ═══════════════════════════════════════════════════════════════
// 1. SovDonut — ranked horizontal bars (NOT a donut)
// ═══════════════════════════════════════════════════════════════

describe("SovDonut — ranked bars", () => {
  // One Share of Voice (7 Nov): the card shows the shared counter's payload
  // (lib/visibility/share-of-voice.ts); every share arrives computed.
  async function renderSov(props: { sov: SovPayload | null; loading?: boolean }) {
    const { SovDonut } = await import("@/components/domain/visibility/sov-donut");
    return render(React.createElement(SovDonut, props));
  }

  const payload = (over: Partial<SovPayload> = {}): SovPayload => ({
    line: {
      brandId: "b",
      brandName: "My Brand",
      share: "12%",
      detail: "3 of 25 mentions",
      audit: "Audit #4, 2 Nov",
      smallSample: false,
      note: null,
    },
    measured: true,
    brandName: "My Brand",
    brandMentions: 3,
    totalMentions: 25,
    sharePct: 12,
    smallSample: false,
    competitors: [
      { name: "Big Comp", mentions: 14, sharePct: 56 },
      { name: "Med Comp", mentions: 8, sharePct: 32 },
    ],
    unverifiable: [],
    perEngine: [],
    ...over,
  });

  it("renders bars, not SVG donut elements", async () => {
    const { container } = await renderSov({ sov: payload() });
    // The "how it's counted" info icon is the only circle allowed.
    const circles = Array.from(container.querySelectorAll("circle"));
    expect(circles.filter((c) => !c.closest("[data-info-tip]"))).toHaveLength(0);
    expect(container.querySelector("path[d*='A']")).toBeNull();
    expect(screen.getByText("Share of Voice")).toBeInTheDocument();
  });

  it("highlights brand by IS-BRAND (not rank) — brand lower share still gets 'you' chip", async () => {
    const { container } = await renderSov({ sov: payload() });
    const youChips = screen.getAllByText("you");
    expect(youChips).toHaveLength(1);
    const brandRow = container.querySelector("[data-sov-row='My Brand']") as HTMLElement;
    expect(within(brandRow).getByText("you")).toBeInTheDocument();
    expect(screen.getByText("Big Comp")).toBeInTheDocument();
  });

  it("brand bar visible at 0% share (min-width 4px)", async () => {
    const { container } = await renderSov({
      sov: payload({
        brandMentions: 0,
        sharePct: 0,
        totalMentions: 4,
        competitors: [{ name: "Comp", mentions: 4, sharePct: 100 }],
      }),
    });
    const brandRow = container.querySelector("[data-sov-row='My Brand']") as HTMLElement;
    const innerBar = brandRow.querySelector("[class*='h-full']") as HTMLElement;
    expect(innerBar.style.width).toBe("0%");
    expect(innerBar.style.minWidth).toBe("4px");
  });

  it("percentages use tabular-nums", async () => {
    const { container } = await renderSov({ sov: payload() });
    const tabNums = container.querySelectorAll("[style*='tabular-nums']");
    expect(tabNums.length).toBeGreaterThanOrEqual(2);
  });

  it("sorted by mentions DESC — most mentioned first", async () => {
    const { container } = await renderSov({ sov: payload() });
    const rows = Array.from(container.querySelectorAll("[data-sov-row]")).map((el) =>
      el.getAttribute("data-sov-row"),
    );
    expect(rows).toEqual(["Big Comp", "Med Comp", "My Brand"]);
  });

  it("loading state shows aria-busy", async () => {
    const { container } = await renderSov({ sov: null, loading: true });
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
  });

  it("no share to show says why, with the audit", async () => {
    await renderSov({
      sov: payload({
        measured: false,
        sharePct: null,
        line: {
          brandId: "b",
          brandName: "My Brand",
          share: null,
          detail: "No competitors set",
          audit: "Audit #4, 2 Nov",
          smallSample: false,
          note: null,
        },
      }),
    });
    expect(screen.getByText("No competitors set · Audit #4, 2 Nov")).toBeInTheDocument();
  });

  it("engine tabs appear when more than one engine answered", async () => {
    const engine = (name: string) => ({
      engine: name,
      brandMentions: 1,
      brandSharePct: 50,
      totalMentions: 2,
      competitors: [{ name: "Big Comp", mentions: 1, sharePct: 50 }],
    });
    await renderSov({ sov: payload({ perEngine: [engine("chatgpt"), engine("gemini")] }) });
    expect(screen.getByText("All engines")).toBeInTheDocument();
    expect(screen.getByText("chatgpt")).toBeInTheDocument();
    expect(screen.getByText("gemini")).toBeInTheDocument();
  });

  it("unique keys — no duplicate-key warning when a competitor shares the brand's name", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await renderSov({
      sov: payload({ competitors: [{ name: "My Brand", mentions: 2, sharePct: 40 }] }),
    });
    const keyWarnings = consoleSpy.mock.calls.filter((c) => String(c[0]).includes("same key"));
    expect(keyWarnings).toHaveLength(0);
    consoleSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. MentionSourceMatrix — 2×2 archetype
// ═══════════════════════════════════════════════════════════════

describe("MentionSourceMatrix — 2×2 archetype", () => {
  async function renderMatrix(props: Record<string, unknown>) {
    const { MentionSourceMatrix } = await import(
      "@/components/domain/visibility/mention-source-matrix"
    );
    return render(React.createElement(MentionSourceMatrix, props as never));
  }

  it("renders all four quadrant labels", async () => {
    await renderMatrix({
      mentionRate: 25,
      citationRate: 15,
      mentionSourceRatio: 0.6,
      brandArchetype: "recognised_authority",
    });
    expect(screen.getByText("Authority")).toBeInTheDocument();
    expect(screen.getByText("Brand-Led")).toBeInTheDocument();
    expect(screen.getByText("Source-Dep")).toBeInTheDocument();
    expect(screen.getByText("Invisible")).toBeInTheDocument();
  });

  it("active quadrant gets a dot indicator; inactive do not", async () => {
    const { container } = await renderMatrix({
      mentionRate: 25,
      citationRate: 15,
      mentionSourceRatio: 0.6,
      brandArchetype: "recognised_authority",
    });
    const dots = container.querySelectorAll(".w-2.h-2.rounded-full");
    expect(dots).toHaveLength(1);
  });

  it("mentionSourceRatio null → shows 'N/A' (not '0' or crash)", async () => {
    await renderMatrix({
      mentionRate: 0,
      citationRate: 0,
      mentionSourceRatio: null,
      brandArchetype: "invisible",
    });
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("metric chips use tabular-nums", async () => {
    const { container } = await renderMatrix({
      mentionRate: 25,
      citationRate: 15,
      mentionSourceRatio: 0.6,
      brandArchetype: "recognised_authority",
    });
    const tabNums = container.querySelectorAll("[style*='tabular-nums']");
    expect(tabNums.length).toBeGreaterThanOrEqual(3);
  });

  it("archetype info box shows the correct label for the active archetype", async () => {
    await renderMatrix({
      mentionRate: 25,
      citationRate: 3,
      mentionSourceRatio: 0.12,
      brandArchetype: "known_but_untrusted",
    });
    expect(screen.getByText("Known but Untrusted")).toBeInTheDocument();
    expect(screen.getByText("High mentions but low citations")).toBeInTheDocument();
  });

  it("loading state shows aria-busy", async () => {
    const { container } = await renderMatrix({
      mentionRate: 0,
      citationRate: 0,
      mentionSourceRatio: null,
      brandArchetype: "invisible",
      loading: true,
    });
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. FanOutTree — sub-query rows
// ═══════════════════════════════════════════════════════════════

describe("FanOutTree — sub-query rows", () => {
  async function renderTree(props: Record<string, unknown>) {
    const { FanOutTree } = await import("@/components/domain/visibility/fan-out-tree");
    return render(React.createElement(FanOutTree, props as never));
  }

  const RESULTS = [
    {
      subQuery: "best plumber in Bondi",
      subQueryRank: 1,
      brandAppeared: true,
      brandPosition: 2,
      contentSimilarityScore: "0.920",
      aboveThreshold: true,
    },
    {
      subQuery: "emergency plumber Sydney",
      subQueryRank: 2,
      brandAppeared: false,
      brandPosition: null,
      contentSimilarityScore: "0.350",
      aboveThreshold: false,
    },
    {
      subQuery: "plumber reviews Bondi",
      subQueryRank: 3,
      brandAppeared: false,
      brandPosition: null,
      contentSimilarityScore: null,
      aboveThreshold: false,
    },
  ];

  it("above-threshold row has layer-visibility left border", async () => {
    const { container } = await renderTree({
      originalPrompt: "best plumber in {location}",
      results: RESULTS,
    });
    const rows = container.querySelectorAll(".rounded-lg.px-3.py-2");
    const aboveRow = Array.from(rows).find((r) =>
      (r as HTMLElement).style.borderLeft.includes("--layer-visibility"),
    );
    expect(aboveRow).toBeTruthy();
  });

  it("non-threshold row has muted left border", async () => {
    const { container } = await renderTree({
      originalPrompt: "best plumber in {location}",
      results: RESULTS,
    });
    const rows = container.querySelectorAll(".rounded-lg.px-3.py-2");
    const mutedRow = Array.from(rows).find((r) =>
      (r as HTMLElement).style.borderLeft.includes("--bg-active"),
    );
    expect(mutedRow).toBeTruthy();
  });

  it("similarity score uses tabular-nums", async () => {
    const { container } = await renderTree({
      originalPrompt: "best plumber",
      results: RESULTS,
    });
    const tabNums = container.querySelectorAll("[style*='tabular-nums']");
    expect(tabNums.length).toBeGreaterThanOrEqual(2);
  });

  it("shows 'Cited' badge only for brandAppeared=true rows", async () => {
    await renderTree({
      originalPrompt: "best plumber",
      results: RESULTS,
    });
    const citedBadges = screen.getAllByText("Cited");
    expect(citedBadges).toHaveLength(1);
  });

  it("rows sorted by subQueryRank ascending", async () => {
    const { container } = await renderTree({
      originalPrompt: "best plumber",
      results: [RESULTS[2], RESULTS[0], RESULTS[1]],
    });
    const ranks = Array.from(container.querySelectorAll(".w-5.text-center")).map((el) =>
      el.textContent?.trim(),
    );
    expect(ranks).toEqual(["1", "2", "3"]);
  });

  it("original prompt shown as title (no literal {location})", async () => {
    await renderTree({
      originalPrompt: "best plumber in Bondi, NSW",
      results: RESULTS.slice(0, 1),
    });
    expect(screen.getByText("best plumber in Bondi, NSW")).toBeInTheDocument();
    expect(screen.queryByText(/\{location\}/)).toBeNull();
  });

  it("loading state shows aria-busy", async () => {
    const { container } = await renderTree({
      originalPrompt: "test",
      results: [],
      loading: true,
    });
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
  });

  it("null similarity score renders no score badge for that row", async () => {
    const { container } = await renderTree({
      originalPrompt: "test",
      results: [RESULTS[2]],
    });
    expect(screen.queryByText("0.000")).toBeNull();
    const dots = container.querySelectorAll(".w-1\\.5.h-1\\.5.rounded-full");
    expect(dots).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. TopicalGapList — gap list with HIGH LEVERAGE badge
// ═══════════════════════════════════════════════════════════════

describe("TopicalGapList — gap list", () => {
  async function renderGaps(props: Record<string, unknown>) {
    const { TopicalGapList } = await import("@/components/domain/visibility/topical-gap-list");
    return render(React.createElement(TopicalGapList, props as never));
  }

  const GAPS = [
    {
      id: "1",
      topicCluster: "local_seo",
      topicLabel: "Local SEO",
      brandHasContent: false,
      crossPromptImpact: 4,
      estimatedCitationImpact: "0.3",
      competitorCoverage: [{ domain: "comp.com.au", has_content: true, depth: 80 }],
    },
    {
      id: "2",
      topicCluster: "emergency",
      topicLabel: "Emergency",
      brandHasContent: true,
      crossPromptImpact: 1,
      estimatedCitationImpact: "0.1",
      competitorCoverage: [],
    },
    {
      id: "3",
      topicCluster: "reviews",
      topicLabel: "Reviews",
      brandHasContent: false,
      crossPromptImpact: 2,
      estimatedCitationImpact: "0.2",
      competitorCoverage: [{ domain: "other.com.au", has_content: true, depth: 50 }],
    },
  ];

  it("sorted by crossPromptImpact DESC — highest first", async () => {
    const { container } = await renderGaps({ gaps: GAPS });
    const labels = Array.from(container.querySelectorAll(".text-\\[13px\\].font-medium")).map(
      (el) => el.textContent,
    );
    expect(labels[0]).toBe("Local SEO");
    expect(labels[1]).toBe("Reviews");
    expect(labels[2]).toBe("Emergency");
  });

  it("HIGH LEVERAGE badge appears when crossPromptImpact >= 2", async () => {
    await renderGaps({ gaps: GAPS });
    const impactBadges = screen.getAllByText(/HIGH LEVERAGE/);
    expect(impactBadges).toHaveLength(2);
  });

  it("HIGH LEVERAGE badge does NOT appear when crossPromptImpact < 2", async () => {
    await renderGaps({
      gaps: [
        {
          id: "x",
          topicCluster: "test",
          topicLabel: "Test",
          brandHasContent: true,
          crossPromptImpact: 1,
          estimatedCitationImpact: null,
          competitorCoverage: [],
        },
      ],
    });
    expect(screen.queryByText(/HIGH LEVERAGE/)).toBeNull();
  });

  it("impact number uses tabular-nums", async () => {
    const { container } = await renderGaps({ gaps: GAPS });
    const tabNums = container.querySelectorAll("[style*='tabular-nums']");
    expect(tabNums.length).toBeGreaterThanOrEqual(1);
  });

  it("empty state shows 'No topical gaps detected'", async () => {
    await renderGaps({ gaps: [] });
    expect(screen.getByText("No topical gaps detected")).toBeInTheDocument();
  });

  it("'No content' badge renders for brandHasContent=false", async () => {
    await renderGaps({ gaps: GAPS });
    const noContent = screen.getAllByText("No content");
    expect(noContent).toHaveLength(2);
  });

  it("competitor coverage shows filtered domains with has_content=true", async () => {
    await renderGaps({ gaps: GAPS });
    expect(screen.getByText(/comp\.com\.au/)).toBeInTheDocument();
  });

  it("loading state shows aria-busy", async () => {
    const { container } = await renderGaps({ gaps: [], loading: true });
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. CitationFailureCard — per-pattern card
// ═══════════════════════════════════════════════════════════════

describe("CitationFailureCard — per-pattern card", () => {
  async function renderCard(diagnosis: Record<string, unknown>) {
    const { CitationFailureCard } = await import(
      "@/components/domain/visibility/citation-failure-card"
    );
    return render(React.createElement(CitationFailureCard, { diagnosis } as never));
  }

  it("renders headline from patternKey (formatted)", async () => {
    await renderCard({
      patternKey: "missing_topic_coverage",
      severity: "high",
      evidence: "No content for this topic",
    });
    expect(screen.getByText("Missing Topic Coverage")).toBeInTheDocument();
  });

  // Task #46 follow-up: "brand_domain_not_cited" is the real patternKey
  // diagnose() emits (lib/visibility/citation-failure-diagnosis.ts) --
  // previously unmapped, so it rendered as the raw key.
  it("renders a human title for brand_domain_not_cited, not the raw key", async () => {
    await renderCard({
      patternKey: "brand_domain_not_cited",
      severity: "high",
      evidence: "Test",
    });
    expect(screen.getByText("AI engines don't cite your website")).toBeInTheDocument();
    expect(screen.queryByText("brand_domain_not_cited")).not.toBeInTheDocument();
  });

  it("falls back to the raw patternKey for a genuinely unrecognised key", async () => {
    await renderCard({
      patternKey: "some_future_pattern",
      severity: "low",
      evidence: "Test",
    });
    expect(screen.getByText("some_future_pattern")).toBeInTheDocument();
  });

  it("severity high → danger styling on pill, labelled 'High' not 'high'", async () => {
    const { container } = await renderCard({
      patternKey: "missing_topic_coverage",
      severity: "high",
      evidence: "Test",
    });
    const pill = screen.getByText("High");
    expect(pill.style.color).toBe("var(--danger)");
    expect(pill.style.backgroundColor).toBe("var(--danger-soft)");
    expect(screen.queryByText("high")).not.toBeInTheDocument();
  });

  it("severity medium → warning styling, labelled 'Med' not 'medium'", async () => {
    await renderCard({
      patternKey: "brand_domain_not_cited",
      severity: "medium",
      evidence: "Test",
    });
    const pill = screen.getByText("Med");
    expect(pill.style.color).toBe("var(--warning)");
    expect(pill.style.backgroundColor).toBe("var(--warning-soft)");
  });

  it("severity low → secondary styling, labelled 'Low' not 'low'", async () => {
    await renderCard({
      patternKey: "competitor_cited_instead",
      severity: "low",
      evidence: "Test",
    });
    const pill = screen.getByText("Low");
    expect(pill.style.color).toBe("var(--text-secondary)");
  });

  it("evidence text rendered", async () => {
    await renderCard({
      patternKey: "missing_topic_coverage",
      severity: "high",
      evidence: "Brand has no coverage for emergency plumbing",
    });
    expect(screen.getByText("Brand has no coverage for emergency plumbing")).toBeInTheDocument();
  });

  it("competitorCited renders when present", async () => {
    await renderCard({
      patternKey: "competitor_cited_instead",
      severity: "medium",
      evidence: "Test",
      competitorCited: "bigcomp.com.au",
    });
    expect(screen.getByText("bigcomp.com.au")).toBeInTheDocument();
    expect(screen.getByText(/Competitor cited:/)).toBeInTheDocument();
  });

  it("competitorCited absent → no competitor section", async () => {
    await renderCard({
      patternKey: "missing_topic_coverage",
      severity: "high",
      evidence: "Test",
    });
    expect(screen.queryByText(/Competitor cited:/)).toBeNull();
  });

  it("remediation CTA renders when present", async () => {
    await renderCard({
      patternKey: "missing_topic_coverage",
      severity: "high",
      evidence: "Test",
      remediation: "Create a guide on emergency plumbing",
    });
    expect(screen.getByText("Create a guide on emergency plumbing")).toBeInTheDocument();
  });

  it("card left border uses severity config border color", async () => {
    const { container } = await renderCard({
      patternKey: "missing_topic_coverage",
      severity: "high",
      evidence: "Test",
    });
    const card = container.firstChild as HTMLElement;
    expect(card.style.borderLeft).toContain("var(--danger)");
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. CompetitiveBenchmarkPanel — CPR-01 + tiering
// ═══════════════════════════════════════════════════════════════

describe("CompetitiveBenchmarkPanel — CPR-01 + tiering", () => {
  async function renderPanel(props: Record<string, unknown>) {
    const { CompetitiveBenchmarkPanel } = await import(
      "@/components/domain/visibility/competitive-benchmark-panel"
    );
    return render(React.createElement(CompetitiveBenchmarkPanel, props as never));
  }

  const FULL_DATA = {
    brandShare: 32.5,
    competitorShare: 18.2,
    competitorDomain: "rival.com.au",
    topicalGapsOwned: 5,
    fastestPath: "Create FAQ content covering emergency repairs",
    comparisonData: { dummy: true },
    competitorNarrative: null,
    dataAvailableFrom: null,
  };

  it("comparisonData present → renders head-to-head layout", async () => {
    await renderPanel({ data: FULL_DATA, tier: "growth" });
    expect(screen.getByText("Competitive Benchmark")).toBeInTheDocument();
    expect(screen.getByText("32.5%")).toBeInTheDocument();
    expect(screen.getByText("18.2%")).toBeInTheDocument();
    expect(screen.getByText("vs")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("CPR-01: comparisonData null → 'Coming soon' (NOT error)", async () => {
    const data = {
      ...FULL_DATA,
      comparisonData: null,
      dataAvailableFrom: "Sprint 7",
    };
    await renderPanel({ data, tier: "growth" });
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.getByText(/Sprint 7/)).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).toBeNull();
  });

  it("starter tier → TierGate locked with upgrade CTA", async () => {
    await renderPanel({ data: FULL_DATA, tier: "starter" });
    expect(screen.getByText("Growth plan required")).toBeInTheDocument();
    expect(screen.getByText("Upgrade")).toBeInTheDocument();
  });

  it("free tier → TierGate locked", async () => {
    await renderPanel({ data: FULL_DATA, tier: "free" });
    expect(screen.getByText("Growth plan required")).toBeInTheDocument();
  });

  it("growth tier → renders the panel content (not locked)", async () => {
    await renderPanel({ data: FULL_DATA, tier: "growth" });
    expect(screen.queryByText("Growth plan required")).toBeNull();
    expect(screen.getByText("Competitive Benchmark")).toBeInTheDocument();
  });

  it("agency tier → renders the panel content", async () => {
    await renderPanel({ data: FULL_DATA, tier: "agency" });
    expect(screen.getByText("Competitive Benchmark")).toBeInTheDocument();
    expect(screen.queryByText("plan required")).toBeNull();
  });

  it("data null, non-starter tier → 'Coming soon' placeholder", async () => {
    await renderPanel({ data: null, tier: "growth" });
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.getByText(/Head-to-head comparison available/)).toBeInTheDocument();
  });

  it("fastestPath renders when present", async () => {
    await renderPanel({ data: FULL_DATA, tier: "growth" });
    expect(screen.getByText("Your fastest path")).toBeInTheDocument();
    expect(screen.getByText(FULL_DATA.fastestPath)).toBeInTheDocument();
  });

  it("gap stat uses tabular-nums", async () => {
    const { container } = await renderPanel({ data: FULL_DATA, tier: "growth" });
    const tabNums = container.querySelectorAll("[style*='tabular-nums']");
    expect(tabNums.length).toBeGreaterThanOrEqual(2);
  });

  it("positive gap → success color", async () => {
    await renderPanel({ data: FULL_DATA, tier: "growth" });
    const gapValue = screen.getByText("+14.3%");
    expect(gapValue.style.color).toBe("var(--success)");
  });

  it("negative gap → danger color", async () => {
    const data = { ...FULL_DATA, brandShare: 10, competitorShare: 30 };
    await renderPanel({ data, tier: "growth" });
    const gapValue = screen.getByText("-20.0%");
    expect(gapValue.style.color).toBe("var(--danger)");
  });

  it("loading state → aria-busy", async () => {
    const { container } = await renderPanel({ data: null, tier: "growth", loading: true });
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
  });

  it("responsive grid classes present", async () => {
    const { container } = await renderPanel({ data: FULL_DATA, tier: "growth" });
    expect(container.querySelector(".sm\\:grid-cols-2")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. VolatilityIndicator — boundary at 15.0
// ═══════════════════════════════════════════════════════════════

describe("VolatilityIndicator — boundary at 15.0", () => {
  async function renderVol(props: Record<string, unknown>) {
    const { VolatilityIndicator } = await import(
      "@/components/domain/visibility/volatility-indicator"
    );
    return render(React.createElement(VolatilityIndicator, props as never));
  }

  it("score > 15.0 → alert state (danger styling + ⚠)", async () => {
    await renderVol({ score: 15.1 });
    const indicator = screen.getByRole("status");
    expect(indicator.style.color).toBe("var(--danger)");
    expect(indicator.style.backgroundColor).toBe("var(--danger-soft)");
    expect(indicator).toHaveTextContent("⚠");
    expect(indicator).toHaveAttribute("aria-label", "Citation volatility: 15.1 — volatile");
  });

  it("score = 15.0 exactly → NOT alert (success styling)", async () => {
    await renderVol({ score: 15.0 });
    const indicator = screen.getByRole("status");
    expect(indicator.style.color).toBe("var(--success)");
    expect(indicator.style.backgroundColor).toBe("var(--success-soft)");
    expect(indicator).not.toHaveTextContent("⚠");
    expect(indicator).toHaveAttribute("aria-label", "Citation volatility: 15.0 — stable");
  });

  it("score <= 15.0 → stable state", async () => {
    await renderVol({ score: 10.0 });
    const indicator = screen.getByRole("status");
    expect(indicator.style.color).toBe("var(--success)");
  });

  it("score null → 'Volatility: N/A'", async () => {
    await renderVol({ score: null });
    expect(screen.getByText("Volatility: N/A")).toBeInTheDocument();
  });

  it("loading → aria-busy", async () => {
    const { container } = await renderVol({ score: null, loading: true });
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument();
  });

  it("volatile dot pulses, stable dot does not", async () => {
    const { container: volContainer } = await renderVol({ score: 20 });
    const volDot = volContainer.querySelector(".animate-pulse");
    expect(volDot).toBeInTheDocument();

    const { container: stableContainer } = await renderVol({ score: 10 });
    const stableDot = stableContainer.querySelector(".animate-pulse");
    expect(stableDot).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. DashboardSovStrip — one line per brand (Overview, 7 Nov, item 3)
// ═══════════════════════════════════════════════════════════════

describe("DashboardSovStrip — one line per brand", () => {
  const LINES: SovLine[] = [
    {
      brandId: "brand-a",
      brandName: "Alpha Plumbing",
      share: "33%",
      detail: "2 of 6 mentions",
      audit: "Audit #36, 1 Nov",
      smallSample: false,
      note: null,
    },
    {
      brandId: "brand-b",
      brandName: "Bravo Electrical",
      share: null,
      detail: "No audit yet",
      audit: null,
      smallSample: false,
      note: null,
    },
    {
      brandId: "brand-d",
      brandName: "Delta Glass",
      share: "33%",
      detail: "1 of 3 mentions",
      audit: "Audit #5, 1 Nov",
      smallSample: true,
      note: null,
    },
  ];

  async function renderStrip(lines = LINES, moreBrands = 0) {
    const { DashboardSovStrip } = await import(
      "@/components/domain/visibility/dashboard-sov-strip"
    );
    return render(React.createElement(DashboardSovStrip, { lines, moreBrands }));
  }

  it("renders every brand's line: share, counts and the audit it comes from", async () => {
    const { container } = await renderStrip();
    expect(screen.getByText("Share of Voice")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-sov-brand]")).toHaveLength(3);
    const alpha = container.querySelector("[data-sov-brand='brand-a']") as HTMLElement;
    expect(within(alpha).getByText("Alpha Plumbing")).toBeInTheDocument();
    expect(within(alpha).getByText("33%")).toBeInTheDocument();
    expect(within(alpha).getByText("2 of 6 mentions · Audit #36, 1 Nov")).toBeInTheDocument();
  });

  it("a line without a share says why, with no bar", async () => {
    const { container } = await renderStrip();
    const bravo = container.querySelector("[data-sov-brand='brand-b']") as HTMLElement;
    expect(within(bravo).getByText("No audit yet")).toBeInTheDocument();
    expect(bravo.querySelector("[class*='h-full']")).toBeNull();
  });

  it("under 5 mentions in all is marked small sample", async () => {
    const { container } = await renderStrip();
    const delta = container.querySelector("[data-sov-brand='brand-d']") as HTMLElement;
    expect(within(delta).getByText("small sample")).toBeInTheDocument();
    const alpha = container.querySelector("[data-sov-brand='brand-a']") as HTMLElement;
    expect(within(alpha).queryByText("small sample")).toBeNull();
  });

  it("a 0% share still draws its bar (min-width)", async () => {
    const { container } = await renderStrip([
      { ...LINES[0], share: "0%", detail: "0 of 6 mentions" },
    ]);
    const bar = container.querySelector("[class*='h-full']") as HTMLElement;
    expect(bar.style.width).toBe("0%");
    expect(bar.style.minWidth).toBe("3px");
  });

  it("percentages use tabular-nums", async () => {
    const { container } = await renderStrip();
    expect(container.querySelectorAll("[style*='tabular-nums']")).toHaveLength(2);
  });

  it("brands past the shown lines are one link away", async () => {
    await renderStrip(LINES, 4);
    expect(
      screen.getByRole("link", { name: "4 more brands: see each brand's Visibility page" }),
    ).toHaveAttribute("href", "/brands");
  });
});
