/**
 * `/methods` had no way in from Action Center either -- adds a single,
 * clean "See the full methodology -> " link in the header (present in both
 * the populated and empty-recommendations states, since it's outside the
 * `totalOpen === 0` branch), not repeated per-card.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Action Center -> methodology link", () => {
  const src = readFileSync("app/(auth)/action-center/page.tsx", "utf8");

  it('links to /methods with the "See the full methodology" text', () => {
    expect(src).toMatch(/<Link\s+href="\/methods"/);
    expect(src).toMatch(/See the full methodology/);
  });

  it("appears exactly once -- not duplicated per recommendation card", () => {
    const matches = src.match(/href="\/methods"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("sits in the page header, not inside the empty-state-only or DimensionGroup branch", () => {
    const linkIndex = src.indexOf('href="/methods"');
    const emptyStateIndex = src.indexOf("totalOpen === 0");
    const dimensionGroupIndex = src.indexOf("<DimensionGroup");
    expect(linkIndex).toBeGreaterThan(-1);
    // The link's source position comes before both branches render --
    // i.e. it's in the shared header, so it's visible regardless of which
    // branch (empty-state vs populated list) is taken.
    expect(linkIndex).toBeLessThan(emptyStateIndex);
    expect(linkIndex).toBeLessThan(dimensionGroupIndex);
  });
});
