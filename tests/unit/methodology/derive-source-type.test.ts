/**
 * ⚠️ XXX — deriveSourceType is the runtime equivalent of VVV's hand-
 * classification, used wherever provenance has to be computed from live
 * data (Action Center's evidenceRefs) rather than hand-set in a static
 * seed. Exact-match by design: a near-miss (wrong url, slightly different
 * name) must fall through to "vunnara_estimate", never be waved through
 * as "research".
 */
import { describe, expect, it } from "vitest";
import { deriveSourceType, VERIFIED_CITATIONS } from "@/lib/methodology/verified-citations";

describe("⚠️ XXX — deriveSourceType", () => {
  it("an exact (name, url) match on a verified citation -> research", () => {
    const { name, url } = VERIFIED_CITATIONS.aggarwalGEO;
    expect(deriveSourceType(name, url)).toBe("research");
  });

  it("every VERIFIED_CITATIONS entry round-trips to research", () => {
    for (const { name, url } of Object.values(VERIFIED_CITATIONS)) {
      expect(deriveSourceType(name, url)).toBe("research");
    }
  });

  it("a correct name but wrong url -> vunnara_estimate (no accidental match on name alone)", () => {
    expect(deriveSourceType(VERIFIED_CITATIONS.aggarwalGEO.name, "https://arxiv.org/abs/9999.99999")).toBe(
      "vunnara_estimate",
    );
  });

  it("a correct url but different name -> vunnara_estimate (no accidental match on url alone)", () => {
    expect(deriveSourceType("Some Other Paper", VERIFIED_CITATIONS.aggarwalGEO.url)).toBe(
      "vunnara_estimate",
    );
  });

  it("an unrelated / fabricated source -> vunnara_estimate", () => {
    expect(deriveSourceType("SE Ranking Dec 2025", "https://seranking.com/blog/ai-overviews-study/")).toBe(
      "vunnara_estimate",
    );
  });

  it("null/undefined url -> vunnara_estimate, no crash", () => {
    expect(deriveSourceType("Anything", null)).toBe("vunnara_estimate");
    expect(deriveSourceType("Anything", undefined)).toBe("vunnara_estimate");
  });
});
