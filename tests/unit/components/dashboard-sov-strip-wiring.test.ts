/**
 * ⚠️ BBB, then Overview (7 Nov), item 3 -- the dashboard's Share of Voice must never be its own
 * reimplementation. BBB found the strip maxing each competitor's percentage (122.8% in all) and moved
 * it onto the shared snapshot aggregator; item 3 moved the Overview off the snapshots entirely, onto
 * the Visibility headline's own answer set (lib/visibility/share-of-voice.ts). The strip now only lays
 * out lines the server computed: it fetches nothing and sums nothing.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const strip = readFileSync("components/domain/visibility/dashboard-sov-strip.tsx", "utf8");
const page = readFileSync("app/(auth)/dashboard/page.tsx", "utf8");

describe("Overview Share of Voice wiring", () => {
  it("the page builds every line with the shared function and its line formatter", () => {
    expect(page).toMatch(
      /import\s*\{\s*shareOfVoiceForBrands\s*,\s*sovLine\s*\}\s*from\s*"@\/lib\/visibility\/share-of-voice"/,
    );
    expect(page).toMatch(/shareOfVoiceForBrands\(/);
    expect(page).toMatch(/sovLine\(/);
    // The old one-brand strip: whichever brand came first.
    expect(page).not.toMatch(/DashboardSovStrip brandId=/);
  });

  it("the strip fetches nothing and computes no share of its own", () => {
    expect(strip).not.toMatch(/fetch\(/);
    expect(strip).not.toMatch(/aggregateShareOfVoice|competitorMap|Math\.max\(existing/);
    expect(strip).not.toMatch(/toFixed\(/);
    expect(strip).not.toMatch(/"use client"/);
  });
});
