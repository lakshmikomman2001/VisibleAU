/**
 * The "domain_mismatch" sub-case (a different business's domain
 * positively detected -- the live Get Plumbing case) was rendering the
 * same generic "might be yours" copy as "no_domain_signal" (found
 * nothing either way). Both stay unconfirmed/unscored, but the copy must
 * say which actually happened.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("YouTube Presence page -- domain_mismatch and no_domain_signal get distinct copy", () => {
  const src = readFileSync("app/(auth)/brands/[brandId]/trust/youtube-presence/page.tsx", "utf8");

  it("branches the header on the gaps-encoded reason, not a single generic string", () => {
    expect(src).toContain('reason === "domain_mismatch"');
    expect(src).toMatch(/isDomainMismatch\s*\?/);
  });

  it("the domain_mismatch header names it as a different business", () => {
    expect(src).toContain("looks like a different business");
  });

  it("the domain_mismatch body names the actual detected domain, not a hardcoded string", () => {
    const idx = src.indexOf("probably not yours");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(block).toContain("${conflictingDomain}");
  });

  it("the no_domain_signal body keeps the original softer wording", () => {
    expect(src).toContain("nothing on the channel confirms it's this brand's");
  });

  it("the confirm/correct form (ConfirmChannelForm) is present for both sub-states -- rendered once, shared by the single unconfirmed branch", () => {
    const unconfirmedIndex = src.indexOf('data.checkStatus === "unconfirmed"');
    const nextBranchIndex = src.indexOf("return (", src.indexOf("return (", unconfirmedIndex) + 1);
    const block = src.slice(unconfirmedIndex, nextBranchIndex);
    const matches = block.match(/<ConfirmChannelForm/g) ?? [];
    expect(matches.length).toBe(1); // one shared instance, not duplicated per branch
  });
});

describe("youtube-presence route.ts -- surfaces gaps + brandDomain for the unconfirmed shape", () => {
  const src = readFileSync("app/api/brands/[brandId]/youtube-presence/route.ts", "utf8");

  it("includes gaps in the unconfirmed response (the [reason, conflictingDomain?] encoding)", () => {
    const idx = src.indexOf('checkStatus: "unconfirmed" as const');
    const block = src.slice(idx, idx + 500);
    expect(block).toContain("gaps: latest.gaps");
  });

  it("includes brandDomain (already-fetched brand data, no schema change) for the '(not {brandDomain})' wording", () => {
    const idx = src.indexOf('checkStatus: "unconfirmed" as const');
    const block = src.slice(idx, idx + 500);
    expect(block).toContain("brandDomain: brand.domain");
  });
});
