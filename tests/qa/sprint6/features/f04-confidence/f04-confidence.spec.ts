import { test, expect } from "@playwright/test";
import { classifyConfidence } from "../../shared/db";

test.describe("F04: Confidence label classification — 11 keys → 3 levels", () => {
  test("F04-01: wikipedia-article → confirmed", async () => {
    expect(classifyConfidence("wikipedia-article")).toBe("confirmed");
  });
  test("F04-02: au-local-citations → confirmed", async () => {
    expect(classifyConfidence("au-local-citations")).toBe("confirmed");
  });
  test("F04-03: stale-content → confirmed", async () => {
    expect(classifyConfidence("stale-content")).toBe("confirmed");
  });
  test("F04-04: faq-content → likely", async () => {
    expect(classifyConfidence("faq-content")).toBe("likely");
  });
  test("F04-05: expert-quotes → likely", async () => {
    expect(classifyConfidence("expert-quotes")).toBe("likely");
  });
  test("F04-06: cited-statistics → likely", async () => {
    expect(classifyConfidence("cited-statistics")).toBe("likely");
  });
  test("F04-07: reddit-absence → likely", async () => {
    expect(classifyConfidence("reddit-absence")).toBe("likely");
  });
  test("F04-08: press-mentions → likely", async () => {
    expect(classifyConfidence("press-mentions")).toBe("likely");
  });
  test("F04-09: comparison-article → hypothesis", async () => {
    expect(classifyConfidence("comparison-article")).toBe("hypothesis");
  });
  test("F04-10: medium-presence → hypothesis", async () => {
    expect(classifyConfidence("medium-presence")).toBe("hypothesis");
  });
  test("F04-11: linkedin-presence → hypothesis", async () => {
    expect(classifyConfidence("linkedin-presence")).toBe("hypothesis");
  });
  test("F04-12: unknown key → hypothesis (conservative default)", async () => {
    expect(classifyConfidence("nonexistent-key")).toBe("hypothesis");
  });
});
