/**
 * Overview (7 Nov), items 1-3 -- the wording each card uses for what it covers, for the cases the
 * page's integration test (tests/integration/overview-cards.integration.test.tsx) doesn't seed.
 */
import { describe, expect, it } from "vitest";
import {
  averageVisibility,
  averageVisibilitySub,
  type BrandVisibility,
  latestAuditCard,
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

// Part 14 (Sri, 13 Nov): the 4th card was "LLM spend this month" -- what we pay the providers is for
// operators only. It's the workspace's latest audit now: its date in Sydney time, brand and status.
describe("Latest audit", () => {
  it("the newest audit's Sydney date, brand and status", () => {
    // 13 Nov 23:30 UTC is 14 Nov in Sydney.
    const card = latestAuditCard(
      {
        brandName: "Hero Home Services",
        status: "failed",
        createdAt: new Date("2026-11-13T23:30:00Z"),
      },
      "org-1",
    );
    expect(card).toEqual({ value: "14 Nov", sub: "Hero Home Services · Failed" });
    expect(
      latestAuditCard(
        { brandName: "Omega", status: "running", createdAt: new Date("2026-11-13T01:00:00Z") },
        "o",
      ).sub,
    ).toBe("Omega · Running");
  });

  it("no audit yet says so, with no figure", () => {
    expect(latestAuditCard(null, "org-1")).toEqual({ value: "—", sub: "No audits yet" });
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
    competitors: [],
    unverifiable: [],
    perEngine: [],
    ...over,
  });

  it("a whole percentage, the counts, and the audit with its Sydney date", () => {
    expect(sovLine(sov({}), "org")).toEqual({
      brandId: "b",
      brandName: "hipages",
      share: "13%",
      detail: "10 of 79 verified mentions",
      audit: "Audit #36, 24 Oct",
      smallSample: false,
      note: null,
    });
  });

  it("says why there's no share", () => {
    const why = (state: BrandShareOfVoice["state"]) =>
      sovLine(sov({ state, sharePct: null }), "org").detail;
    expect(why("no_competitors")).toBe("No competitors set");
    expect(why("no_mentions")).toBe("No verified mentions of you or your competitors");
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
