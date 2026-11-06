/**
 * Overview (7 Nov), items 1-3 -- the wording each card uses for what it covers, for the cases the
 * page's integration test (tests/integration/overview-cards.integration.test.tsx) doesn't seed.
 */
import { describe, expect, it } from "vitest";
import {
  averageVisibility,
  averageVisibilitySub,
  type BrandVisibility,
  spendCard,
} from "@/lib/dashboard/overview-cards";
import { type BrandShareOfVoice, sovLine } from "@/lib/visibility/share-of-voice";
import { formatSharePercent } from "@/lib/visibility/share-of-voice-display";

const scored = (value: number, missingAnEngine = false): BrandVisibility => ({
  headline: { status: "scored", value, ci: { lower: 0, upper: 100 } },
  missingAnEngine,
});
const tooFew: BrandVisibility = {
  headline: { status: "insufficient_data", reason: "no_answers" },
  missingAnEngine: false,
};
const noAudit: BrandVisibility = { headline: null, missingAnEngine: false };

describe("Avg visibility", () => {
  it("averages the brands with a Visibility, each once, and names the ones left out", () => {
    const avg = averageVisibility([scored(10), scored(20), scored(60), tooFew, tooFew]);
    expect(avg.value).toBe(30);
    expect(averageVisibilitySub(avg)).toBe(
      "Average of 3 brands' latest audits · 2 without enough answers",
    );
  });

  it("says when audits missing an engine are in it", () => {
    expect(averageVisibilitySub(averageVisibility([scored(10, true)]))).toBe(
      "Average of 1 brand's latest audit · it missing an engine",
    );
    expect(averageVisibilitySub(averageVisibility([scored(10, true), scored(20)]))).toBe(
      "Average of 2 brands' latest audits · 1 missing an engine",
    );
  });

  it("with nothing to average it shows no number, and why", () => {
    const leftOut = averageVisibility([tooFew, noAudit, noAudit]);
    expect(leftOut.value).toBeNull();
    expect(averageVisibilitySub(leftOut)).toBe("1 without enough answers · 2 with no audit yet");
    expect(averageVisibilitySub(averageVisibility([noAudit]))).toBe("Run audits to see it");
  });
});

describe("LLM spend", () => {
  it("splits audits from other features, and says when part of it had no price", () => {
    const card = spendCard({
      auditCount: 2,
      auditsUsd: 0.26,
      otherFeaturesAudCents: 150,
      incomplete: true,
    });
    expect(card.value).toBe("A$1.90");
    expect(card.sub).toBe("Cost incomplete · Audits A$0.40 · Other features A$1.50");
    expect(card.note).toContain("US$0.26 provider usage");
    expect(card.note).toContain("Not included: content drafts");
  });
});

describe("Share of Voice lines", () => {
  const audit = {
    id: "a",
    auditNumber: 36,
    completedAt: new Date("2026-10-24T02:00:00.000Z"),
    methodologyVersion: 3,
  };
  const sov = (over: Partial<BrandShareOfVoice>): BrandShareOfVoice => ({
    brandId: "b",
    brandName: "hipages",
    state: "measured",
    audit,
    brandMentions: 10,
    totalMentions: 79,
    sharePct: (10 / 79) * 100,
    smallSample: false,
    ...over,
  });

  it("a whole percentage, the counts, and the audit with its Sydney date", () => {
    expect(sovLine(sov({}), "org")).toEqual({
      brandId: "b",
      brandName: "hipages",
      share: "13%",
      detail: "10 of 79 mentions",
      audit: "Audit #36, 24 Oct",
      smallSample: false,
    });
  });

  it("says why there's no share", () => {
    const why = (state: BrandShareOfVoice["state"]) =>
      sovLine(sov({ state, sharePct: null }), "org").detail;
    expect(why("no_competitors")).toBe("No competitors set");
    expect(why("no_mentions")).toBe("No mentions of you or your competitors");
    expect(why("not_enough_answers")).toBe("Not enough answers");
    expect(sovLine(sov({ state: "no_audit", sharePct: null, audit: null }), "org")).toMatchObject({
      share: null,
      detail: "No audit yet",
      audit: null,
    });
  });

  it("rounds like Visibility: 12.7 -> 13%, 3.8 -> 4%", () => {
    expect(formatSharePercent(12.7)).toBe("13%");
    expect(formatSharePercent(3.8)).toBe("4%");
    expect(formatSharePercent(0)).toBe("0%");
  });
});
