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
