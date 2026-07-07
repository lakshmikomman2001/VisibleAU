import { describe, it, expect } from "vitest";
import { scoreLinkedinPresence } from "@/lib/trust/linkedin-auditor";

const BASE_INPUT = {
  companyPageUrl: null,
  companyPageExists: false,
  companyPageFollowers: 0,
  companyPosts30d: 0,
  companyArticlesCount: 0,
  founderProfileUrl: null,
  founderProfileExists: false,
  founderFollowers: 0,
  founderPosts30d: 0,
  founderArticlesCount: 0,
  founderArticles500plus: 0,
  knowledgeSharingRatio: 0,
  originalContentRatio: 0,
  semanticRelevanceScore: 0,
};

describe("scoreLinkedinPresence — formula thresholds", () => {
  it("all zeros → score 0", () => {
    const result = scoreLinkedinPresence(BASE_INPUT);
    expect(result.presenceScore).toBe(0);
  });

  it("company page exists → +15", () => {
    const result = scoreLinkedinPresence({
      ...BASE_INPUT,
      companyPageExists: true,
    });
    expect(result.presenceScore).toBe(15);
  });

  it("company posts ≥4 → +10", () => {
    const result = scoreLinkedinPresence({
      ...BASE_INPUT,
      companyPageExists: true,
      companyPosts30d: 4,
    });
    expect(result.presenceScore).toBe(25);
  });

  it("founder exists + followers ≥2000 → +20", () => {
    const result = scoreLinkedinPresence({
      ...BASE_INPUT,
      founderProfileExists: true,
      founderFollowers: 2000,
    });
    expect(result.presenceScore).toBe(20);
  });

  it("perfect score → 100", () => {
    const result = scoreLinkedinPresence({
      ...BASE_INPUT,
      companyPageExists: true,
      companyPosts30d: 4,
      companyArticlesCount: 2,
      founderProfileExists: true,
      founderFollowers: 2000,
      founderPosts30d: 5,
      founderArticles500plus: 2,
      knowledgeSharingRatio: 0.54,
      originalContentRatio: 0.95,
      semanticRelevanceScore: 0.7,
    });
    expect(result.presenceScore).toBe(100);
  });

  it("returns gaps array for missing items", () => {
    const result = scoreLinkedinPresence(BASE_INPUT);
    expect(result.gaps.length).toBeGreaterThan(0);
  });
});
