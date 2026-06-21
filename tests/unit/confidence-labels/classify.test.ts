import { describe, expect, it } from "vitest";
import { classifyByKey, classifyByScore } from "@/lib/confidence-labels/classify";

describe("classifyByScore", () => {
  it("score >= 70 → confirmed", () => {
    expect(classifyByScore(70)).toBe("confirmed");
    expect(classifyByScore(100)).toBe("confirmed");
  });

  it("score >= 40 and < 70 → likely", () => {
    expect(classifyByScore(40)).toBe("likely");
    expect(classifyByScore(69)).toBe("likely");
  });

  it("score < 40 → hypothesis", () => {
    expect(classifyByScore(39)).toBe("hypothesis");
    expect(classifyByScore(0)).toBe("hypothesis");
  });

  it("boundary values", () => {
    expect(classifyByScore(70)).toBe("confirmed");
    expect(classifyByScore(69.9)).toBe("likely");
    expect(classifyByScore(40)).toBe("likely");
    expect(classifyByScore(39.9)).toBe("hypothesis");
  });
});

describe("classifyByKey", () => {
  it("known confirmed keys", () => {
    expect(classifyByKey("wikipedia-article")).toBe("confirmed");
    expect(classifyByKey("au-local-citations")).toBe("confirmed");
  });

  it("known likely keys", () => {
    expect(classifyByKey("faq-content")).toBe("likely");
    expect(classifyByKey("expert-quotes")).toBe("likely");
  });

  it("known hypothesis keys", () => {
    expect(classifyByKey("comparison-article")).toBe("hypothesis");
    expect(classifyByKey("medium-presence")).toBe("hypothesis");
  });

  it("unknown keys default to hypothesis", () => {
    expect(classifyByKey("nonexistent-key")).toBe("hypothesis");
    expect(classifyByKey("")).toBe("hypothesis");
  });
});
