/**
 * lib/scoring/visibility-display.ts -- how every list, dashboard and
 * export shows a Visibility: the audit page's own "8%" over "3 of 40",
 * coloured by the headline bands, or "—" with the reason.
 */
import { describe, expect, it } from "vitest";
import {
  auditVisibilityDisplay,
  formatVisibilityPercent,
  NO_AUDIT_YET,
  NOT_ENOUGH_ANSWERS,
  NOT_FINISHED,
  visibilityColorVar,
  visibilityDisplay,
} from "@/lib/scoring/visibility-display";

const ci = { lower: 2.6, upper: 19.9 };
const scored = (value: number, mentionedCount: number, sampleCount: number) => ({
  headline: { status: "scored" as const, value, ci },
  mentionedCount,
  sampleCount,
});

describe("visibilityDisplay", () => {
  it("audit #36 (3 of 40): '8%' over '3 of 40' -- never '7.5'", () => {
    const shown = visibilityDisplay(scored(7.5, 3, 40));
    expect(shown).toEqual({ value: "8%", detail: "3 of 40", band: "low" });
    expect(JSON.stringify(shown)).not.toContain("7.5");
  });

  it("colours by the headline bands: 30%+ strong, 10-29% developing, under 10% low", () => {
    expect(visibilityDisplay(scored(30, 12, 40)).band).toBe("strong");
    expect(visibilityDisplay(scored(29.2, 7, 24)).band).toBe("developing");
    expect(visibilityDisplay(scored(10, 4, 40)).band).toBe("developing");
    expect(visibilityDisplay(scored(9.9, 4, 41)).band).toBe("low");
    expect(visibilityColorVar("strong")).toBe("var(--success)");
    expect(visibilityColorVar("developing")).toBe("var(--warning)");
    expect(visibilityColorVar("low")).toBe("var(--danger)");
    expect(visibilityColorVar(null)).toBe("var(--text-tertiary)");
  });

  it("a real 0% over real answers is shown as 0%, with its counts", () => {
    expect(visibilityDisplay(scored(0, 0, 40))).toEqual({
      value: "0%",
      detail: "0 of 40",
      band: "low",
    });
  });

  it("below the 10-answer minimum: '—' with 'Not enough answers'", () => {
    expect(
      visibilityDisplay({
        headline: { status: "insufficient_data", reason: "no_answers" },
        mentionedCount: 2,
        sampleCount: 5,
      }),
    ).toEqual({ value: "—", detail: NOT_ENOUGH_ANSWERS, band: null });
  });

  it("no complete audit: '—' with 'No audit yet'", () => {
    expect(visibilityDisplay(null)).toEqual({ value: "—", detail: NO_AUDIT_YET, band: null });
    expect(visibilityDisplay(undefined)).toEqual({ value: "—", detail: NO_AUDIT_YET, band: null });
  });

  it("rounds like the audit page", () => {
    expect(formatVisibilityPercent(7.5)).toBe("8%");
    expect(formatVisibilityPercent(29.17)).toBe("29%");
    expect(formatVisibilityPercent(50)).toBe("50%");
  });
});

describe("auditVisibilityDisplay (a list of audits)", () => {
  it("only a complete audit has a Visibility", () => {
    expect(auditVisibilityDisplay("running", scored(7.5, 3, 40))).toEqual({
      value: "—",
      detail: NOT_FINISHED,
      band: null,
    });
    expect(auditVisibilityDisplay("complete", scored(7.5, 3, 40)).value).toBe("8%");
  });

  it("a complete audit with nothing resolved is 'Not enough answers', not 'No audit yet'", () => {
    expect(auditVisibilityDisplay("complete", undefined).detail).toBe(NOT_ENOUGH_ANSWERS);
  });
});
