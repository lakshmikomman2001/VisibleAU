/**
 * DEMO-BLOCKER (1 Nov), part 3 -- the report's prose may only state what
 * was measured: a sentence with a number, percentage, rank, engine or
 * verdict that isn't in the report's facts is dropped, and the drop is
 * logged as counts only. Production's PDF said "Mention rate: 60.0%",
 * "recognised authority" and "trending up" for a brand at 17-23%.
 */
import { describe, expect, it, vi } from "vitest";
import {
  type AllowedFacts,
  groundNarrative,
  sentenceProblem,
} from "@/lib/reports/narrative-grounding";
import { aboutHowOften, possessive } from "@/lib/reports/report-narrative";

/** Audit #39's facts: 7 of 40 (18%, CI 9-32%), ChatGPT 4 of 10, Perplexity 3 of 10, typically #1. */
function facts39(overrides: Partial<AllowedFacts> = {}): AllowedFacts {
  return {
    numbers: new Set(["7", "40", "4", "10", "0", "3", "1", "6", "19", "8", "5"]),
    percents: new Set(["18%", "9%", "32%", "40%", "0%", "30%"]),
    ranks: new Set([1]),
    auditNumbers: new Set([37, 38, 39]),
    engines: new Set(["ChatGPT", "Claude", "Gemini", "Perplexity"]),
    claims: new Set(),
    names: ["Omega Services", "hipages", "Word of Mouth", "Localsearch"],
    ...overrides,
  };
}

const CORRECT =
  "When local customers ask AI for help with the kind of work Omega Services does, Omega Services comes up in about 1 in 6 answers: 7 of the 40 we counted.";

describe("groundNarrative", () => {
  it("keeps a sentence whose every number is measured", () => {
    const out = groundNarrative([CORRECT], facts39(), () => {});
    expect(out.paragraphs).toEqual([CORRECT]);
    expect(out).toMatchObject({ kept: 1, dropped: 0 });
  });

  it("drops an invented 60%, and keeps the rest of the paragraph", () => {
    const out = groundNarrative(
      [`${CORRECT} Brand archetype: mention rate 60.0%, citation rate 40.0%.`],
      facts39(),
      () => {},
    );
    expect(out.paragraphs).toEqual([CORRECT]);
    expect(out.dropped).toBe(1);
  });

  it("drops 'trending up' and 'improved' when no computed trend rule says so", () => {
    const out = groundNarrative(
      [
        "Early signal: visibility trending up, not yet enough data to quantify.",
        "Visibility improved by 5 points this period.",
      ],
      facts39(),
      () => {},
    );
    expect(out.paragraphs).toEqual([]);
    expect(out.reasons).toEqual({ trend_claim: 2 });
  });

  it("allows a rise only when the drift rule found a significant one", () => {
    const sentence = "From Audit #37 to #39 Visibility rose by more than the margin of error.";
    expect(sentenceProblem(sentence, facts39())).toBe("trend_claim");
    expect(sentenceProblem(sentence, facts39({ claims: new Set(["trend_rise"]) }))).toBeNull();
  });

  it("drops verdicts no rule computes: 'recognised authority', 'leader', 'best'", () => {
    for (const sentence of [
      "The brand sits in the recognised authority quadrant.",
      "Omega Services is the local leader for handyman work.",
      "AI calls it the best choice in Castle Hill.",
    ]) {
      expect(sentenceProblem(sentence, facts39())).toBe("banned_word");
    }
  });

  it("drops an engine the audit didn't ask, a wrong rank, a wrong audit number and a wrong number word", () => {
    expect(sentenceProblem("Copilot mentioned Omega Services in 4 of 10 answers.", facts39())).toBe(
      "engine",
    );
    expect(sentenceProblem("It's typically listed at #2.", facts39())).toBe("rank");
    expect(sentenceProblem("It's typically listed second.", facts39())).toBe("rank");
    expect(sentenceProblem("Based on Audit #41.", facts39())).toBe("audit_number");
    expect(sentenceProblem("AI cited eleven directories.", facts39())).toBe("number");
    expect(sentenceProblem("Perplexity mentioned it in 3 of 10 answers.", facts39())).toBeNull();
  });

  it("reads the brand's own name as a name, not as a superlative or a number", () => {
    const f = facts39({ names: ["Best Electrical 24/7"] });
    expect(sentenceProblem("Best Electrical 24/7 comes up in 7 of the 40 answers.", f)).toBeNull();
  });

  it("logs a drop as counts only, never the sentence", () => {
    const log = vi.fn();
    groundNarrative([`${CORRECT} Mention rate: 60.0%.`], facts39(), log);
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(JSON.parse(line)).toEqual({
      event: "report_narrative_sentences_dropped",
      kept: 1,
      dropped: 1,
      reasons: { percent: 1 },
    });
    expect(line).not.toContain("Omega");
    expect(line).not.toContain("60");
  });

  it("returns no paragraphs when every sentence fails", () => {
    expect(
      groundNarrative(["Mention rate: 60.0%.", "Trending up."], facts39(), () => {}).paragraphs,
    ).toEqual([]);
  });
});

describe("aboutHowOften", () => {
  it("rounds deterministically: 1 in N below 35%, N in 10 from 35%", () => {
    expect(aboutHowOften(5, 30)?.phrase).toBe("about 1 in 6");
    expect(aboutHowOften(7, 40)?.phrase).toBe("about 1 in 6");
    expect(aboutHowOften(9, 40)?.phrase).toBe("about 1 in 4");
    expect(aboutHowOften(1, 40)?.phrase).toBe("about 1 in 40");
    expect(aboutHowOften(14, 40)?.phrase).toBe("about 4 in 10");
    expect(aboutHowOften(20, 40)?.phrase).toBe("about 5 in 10");
    expect(aboutHowOften(38, 40)?.phrase).toBe("almost every");
    expect(aboutHowOften(40, 40)?.phrase).toBe("every");
    expect(aboutHowOften(0, 40)).toBeNull();
  });

  it("says which numbers it prints", () => {
    expect(aboutHowOften(7, 40)?.numbers).toEqual(["1", "6"]);
    expect(aboutHowOften(16, 40)?.numbers).toEqual(["4", "10"]);
  });
});

describe("possessive", () => {
  it("adds 's, or just ' after a final s", () => {
    expect(possessive("Omega Services")).toBe("Omega Services'");
    expect(possessive("Acme")).toBe("Acme's");
  });
});
