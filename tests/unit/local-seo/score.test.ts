import { describe, expect, it } from "vitest";
import { computeLocalSeoScore } from "@/lib/local-seo/score";

describe("computeLocalSeoScore", () => {
  it("returns 0 when everything is absent/zero", () => {
    const score = computeLocalSeoScore({
      gmb: { present: false, completeness: 0 },
      directories: [{ present: false }, { present: false }, { present: false }, { present: false }],
      nap: { score: 0 },
      suburbs: [{ mentionedInContent: false, mentionedInMeta: false, mentionedInSchema: false }],
    });
    expect(score).toBe(0);
  });

  it("returns 100 when everything is perfect", () => {
    const score = computeLocalSeoScore({
      gmb: { present: true, completeness: 100 },
      directories: [{ present: true }, { present: true }, { present: true }, { present: true }],
      nap: { score: 100 },
      suburbs: [{ mentionedInContent: true, mentionedInMeta: true, mentionedInSchema: true }],
    });
    expect(score).toBe(100);
  });

  it("no suburbs configured gives full suburb marks", () => {
    const score = computeLocalSeoScore({
      gmb: { present: true, completeness: 100 },
      directories: [{ present: true }, { present: true }, { present: true }, { present: true }],
      nap: { score: 100 },
      suburbs: [],
    });
    expect(score).toBe(100);
  });

  it("GMB absent but other components perfect", () => {
    const score = computeLocalSeoScore({
      gmb: { present: false, completeness: 0 },
      directories: [{ present: true }, { present: true }, { present: true }, { present: true }],
      nap: { score: 100 },
      suburbs: [],
    });
    expect(score).toBe(70);
  });

  it("weights sum to 100%", () => {
    const score = computeLocalSeoScore({
      gmb: { present: true, completeness: 50 },
      directories: [{ present: true }, { present: false }],
      nap: { score: 80 },
      suburbs: [
        { mentionedInContent: true, mentionedInMeta: false, mentionedInSchema: false },
        { mentionedInContent: false, mentionedInMeta: false, mentionedInSchema: false },
      ],
    });
    const expected = 50 * 0.3 + 80 * 0.3 + 50 * 0.25 + 50 * 0.15;
    expect(score).toBeCloseTo(expected, 1);
  });
});
