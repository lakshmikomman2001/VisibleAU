import { describe, expect, it } from "vitest";
import { stripPlaceToken, validateGeneratedQuestion } from "@/lib/prompts/validate-question";

describe("validateGeneratedQuestion", () => {
  it("rejects a question that names the place twice", () => {
    const result = validateGeneratedQuestion(
      "Best emergency plumber Norwest in Norwest, NSW?",
      "Norwest, NSW",
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Norwest.*2 times/);
  });

  it("accepts a question that names the place once", () => {
    const result = validateGeneratedQuestion("Best emergency plumber in Norwest, NSW?", "Norwest, NSW");
    expect(result.valid).toBe(true);
  });

  it("rejects a question missing the location when requireLocation is true (default)", () => {
    const result = validateGeneratedQuestion("Best emergency plumber?", "Norwest, NSW");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/missing the location/);
  });

  it("does not require the location when requireLocation is false (business-audience phrasing)", () => {
    const result = validateGeneratedQuestion(
      "Best accounting software for Australian businesses?",
      "Norwest, NSW",
      false,
    );
    expect(result.valid).toBe(true);
  });

  it("rejects doubled whitespace", () => {
    const result = validateGeneratedQuestion("Best plumber in  Norwest, NSW?", "Norwest, NSW");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/whitespace/);
  });

  it("rejects doubled punctuation", () => {
    const result = validateGeneratedQuestion("Best plumber in Norwest, NSW??", "Norwest, NSW");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/punctuation/);
  });

  it("works with a bare suburb (no state) for a curated city", () => {
    expect(validateGeneratedQuestion("Best plumber in Bondi?", "Bondi").valid).toBe(true);
    expect(validateGeneratedQuestion("Best plumber in Bondi, Bondi?", "Bondi").valid).toBe(false);
  });

  it("only matches the place as a whole word (never a substring of another word)", () => {
    // "Norwester" contains "Norwest" as a substring but is a different word.
    const result = validateGeneratedQuestion("Best Norwester supplier in Norwest, NSW?", "Norwest, NSW");
    expect(result.valid).toBe(true);
  });

  // Vunnara hotfix 3 (19 Oct, post-9c2c73a), item 2: the live bug --
  // "Licensed plumber for hot water system replacement Norwest, NSW?"
  // drops the preposition, reading as a run-on rather than a question
  // about a place.
  describe("the location must read naturally -- preceded by in/near/around, or starting the question", () => {
    it("rejects a location with no preposition before it", () => {
      const result = validateGeneratedQuestion(
        "Licensed plumber for hot water system replacement Norwest, NSW?",
        "Norwest, NSW",
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/isn't preceded by "in"\/"near"\/"around"/);
    });

    it("accepts the same question once 'in' is added", () => {
      const result = validateGeneratedQuestion(
        "Licensed plumber for hot water system replacement in Norwest, NSW?",
        "Norwest, NSW",
      );
      expect(result.valid).toBe(true);
    });

    it("accepts 'near' as a valid preposition", () => {
      expect(validateGeneratedQuestion("Affordable tradies near Norwest, NSW?", "Norwest, NSW").valid).toBe(
        true,
      );
    });

    it("accepts 'around' as a valid preposition", () => {
      expect(
        validateGeneratedQuestion("Best handyman around Norwest, NSW for odd jobs?", "Norwest, NSW").valid,
      ).toBe(true);
    });

    it("accepts the location starting the question, with no preposition needed", () => {
      expect(validateGeneratedQuestion("Norwest, NSW tradies -- who's reliable?", "Norwest, NSW").valid).toBe(
        true,
      );
    });

    it("rejects a location preceded by an unrelated word, even mid-sentence", () => {
      expect(
        validateGeneratedQuestion("Emergency electrician Norwest, NSW available 24/7?", "Norwest, NSW").valid,
      ).toBe(false);
    });
  });
});

describe("stripPlaceToken", () => {
  it("removes the place name and collapses the leftover whitespace", () => {
    expect(stripPlaceToken("emergency plumber Norwest", "Norwest, NSW")).toBe("emergency plumber");
  });

  it("is a no-op when the place name isn't present", () => {
    expect(stripPlaceToken("emergency plumber", "Norwest, NSW")).toBe("emergency plumber");
  });

  it("is case-insensitive", () => {
    expect(stripPlaceToken("emergency plumber NORWEST", "Norwest, NSW")).toBe("emergency plumber");
  });
});
