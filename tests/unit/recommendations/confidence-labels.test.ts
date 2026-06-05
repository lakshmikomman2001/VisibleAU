import { describe, expect, it } from "vitest";
import { classifyConfidence } from "@/lib/recommendations/confidence-labels";

describe("classifyConfidence", () => {
  it("wikipedia-article → confirmed", () =>
    expect(classifyConfidence("wikipedia-article")).toBe("confirmed"));
  it("au-local-citations → confirmed", () =>
    expect(classifyConfidence("au-local-citations")).toBe("confirmed"));
  it("stale-content → confirmed", () =>
    expect(classifyConfidence("stale-content")).toBe("confirmed"));

  it("faq-content → likely", () => expect(classifyConfidence("faq-content")).toBe("likely"));
  it("expert-quotes → likely", () => expect(classifyConfidence("expert-quotes")).toBe("likely"));
  it("cited-statistics → likely", () =>
    expect(classifyConfidence("cited-statistics")).toBe("likely"));
  it("reddit-absence → likely", () => expect(classifyConfidence("reddit-absence")).toBe("likely"));
  it("press-mentions → likely", () => expect(classifyConfidence("press-mentions")).toBe("likely"));

  it("comparison-article → hypothesis", () =>
    expect(classifyConfidence("comparison-article")).toBe("hypothesis"));
  it("medium-presence → hypothesis", () =>
    expect(classifyConfidence("medium-presence")).toBe("hypothesis"));
  it("linkedin-presence → hypothesis", () =>
    expect(classifyConfidence("linkedin-presence")).toBe("hypothesis"));

  it("unknown key → hypothesis (conservative default)", () =>
    expect(classifyConfidence("unknown-key")).toBe("hypothesis"));
});
