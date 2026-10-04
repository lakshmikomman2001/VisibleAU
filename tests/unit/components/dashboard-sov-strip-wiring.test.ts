/**
 * ⚠️ BBB — the dashboard's Share of Voice strip must call the SAME shared
 * aggregator the Visibility Hub uses (aggregateShareOfVoice, sums real
 * mention counts) instead of its own Math.max-per-competitor
 * reimplementation, which produced each competitor's single best segment
 * rather than a normalized share -- percentages that summed to 122.8%
 * instead of ~100% (task ZZ). aggregateShareOfVoice's own correctness is
 * already covered by tests/phase2/sprint3/sov-aggregator.test.ts; this file
 * only proves the strip actually delegates to it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_ENGINES, aggregateShareOfVoice, type SovEntry } from "@/components/domain/visibility/sov-donut";

describe("⚠️ BBB — dashboard-sov-strip.tsx wiring", () => {
  it("imports and calls the shared aggregateShareOfVoice, not a local reimplementation", () => {
    const src = readFileSync("components/domain/visibility/dashboard-sov-strip.tsx", "utf8");

    expect(src).toMatch(
      /import\s*\{\s*ALL_ENGINES\s*,\s*aggregateShareOfVoice\s*,\s*type\s*SovEntry\s*\}\s*from\s*"\.\/sov-donut"/,
    );
    expect(src).toMatch(/aggregateShareOfVoice\(/);

    // The old per-competitor Math.max reimplementation must be gone -- a
    // Map accumulating Math.max(existing, share) per competitor domain.
    expect(src).not.toMatch(/competitorMap/);
    expect(src).not.toMatch(/Math\.max\(existing/);
  });

  it("end to end: 4 competitors + brand in one scope sum to a sane <=100%, not 122.8%", () => {
    // The bug report's hipages 36.4 + serviceseeking 36.4 + servicetoday
    // 25.0 + fixedtoday 25.0 + bondi 0.0 = 122.8% came from maxing each
    // competitor's raw percentage across whatever rows it appeared in --
    // structurally unbounded. Real snapshot rows for the same (engine,
    // category) slice share one total; summing counts against that one
    // shared total (what the real aggregator does, and what the strip now
    // calls) can never exceed 100%, however the individual counts fall.
    const sharedGroup = { engine: "chatgpt", promptCategory: "general" };
    const totalMentionCount = 40;
    const entries: SovEntry[] = [
      {
        competitorDomain: "hipages.com.au",
        brandShare: 0,
        competitorShare: 0,
        ...sharedGroup,
        brandMentionCount: 0,
        competitorMentionCount: 10,
        totalMentionCount,
      },
      {
        competitorDomain: "serviceseeking.com.au",
        brandShare: 0,
        competitorShare: 0,
        ...sharedGroup,
        competitorMentionCount: 10,
        totalMentionCount,
      },
      {
        competitorDomain: "servicetoday.com.au",
        brandShare: 0,
        competitorShare: 0,
        ...sharedGroup,
        competitorMentionCount: 7,
        totalMentionCount,
      },
      {
        competitorDomain: "fixedtoday.com.au",
        brandShare: 0,
        competitorShare: 0,
        ...sharedGroup,
        competitorMentionCount: 7,
        totalMentionCount,
      },
    ];

    const { brandSharePct, competitors } = aggregateShareOfVoice(
      entries,
      "bondiplumbing.com.au",
      ALL_ENGINES,
    );

    const total = brandSharePct + competitors.reduce((s, c) => s + c.sharePct, 0);
    // hipages 25% + serviceseeking 25% + servicetoday 17.5% + fixedtoday
    // 17.5% + bondi 0% = 85% -- real counts against one shared total,
    // structurally bounded by 100%, unlike the old 122.8%.
    expect(total).toBeCloseTo(85, 1);
    expect(total).toBeLessThanOrEqual(100);
  });
});
