/**
 * Vunnara (20 Oct, post-a093ceb), headline-fix follow-up, item 5 --
 * lib/scoring/headline-color.ts is the ONE place every surface that
 * colour-codes the headline reads its thresholds from. Locks in the
 * exact bands, and the task's own sanity check: a typical local trade
 * business's 16% mention rate must read as "developing" (amber), never
 * as a red "crisis" score.
 */
import { describe, expect, it } from "vitest";
import { HEADLINE_COLOR_THRESHOLDS, headlineColorBand } from "@/lib/scoring/headline-color";

describe("headlineColorBand", () => {
  it("the thresholds are 30 (strong) and 10 (developing)", () => {
    expect(HEADLINE_COLOR_THRESHOLDS).toEqual({ strong: 30, developing: 10 });
  });

  it("16% -- a typical local trade business's mention rate -- reads as 'developing', never a crisis", () => {
    expect(headlineColorBand(16)).toBe("developing");
  });

  it("30% and above is 'strong'", () => {
    expect(headlineColorBand(30)).toBe("strong");
    expect(headlineColorBand(100)).toBe("strong");
  });

  it("10% up to (not including) 30% is 'developing'", () => {
    expect(headlineColorBand(10)).toBe("developing");
    expect(headlineColorBand(29)).toBe("developing");
  });

  it("below 10% is 'low'", () => {
    expect(headlineColorBand(0)).toBe("low");
    expect(headlineColorBand(9)).toBe("low");
  });
});
