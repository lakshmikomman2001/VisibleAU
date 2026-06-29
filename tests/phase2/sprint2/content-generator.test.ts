import { describe, it, expect } from "vitest";
import { mapRecommendationKeyToDraftType } from "@/lib/workflow/content-generator";
import * as fs from "fs";
import * as path from "path";

describe("content-generator — recommendation_key → draft_type translation", () => {
  it("maps wikipedia-article (hyphen) → wikipedia_article (underscore)", () => {
    expect(mapRecommendationKeyToDraftType("wikipedia-article")).toBe("wikipedia_article");
  });

  it("maps comparison-article → comparison_article", () => {
    expect(mapRecommendationKeyToDraftType("comparison-article")).toBe("comparison_article");
  });

  it("maps faq-block → faq_block", () => {
    expect(mapRecommendationKeyToDraftType("faq-block")).toBe("faq_block");
  });

  it("maps press-release → press_release", () => {
    expect(mapRecommendationKeyToDraftType("press-release")).toBe("press_release");
  });

  it("maps reddit-absence → reddit_comment", () => {
    expect(mapRecommendationKeyToDraftType("reddit-absence")).toBe("reddit_comment");
  });

  it("maps linkedin-presence → linkedin_post", () => {
    expect(mapRecommendationKeyToDraftType("linkedin-presence")).toBe("linkedin_post");
  });

  it("maps linkedin-article → linkedin_article", () => {
    expect(mapRecommendationKeyToDraftType("linkedin-article")).toBe("linkedin_article");
  });

  it("maps answer-capsule → answer_capsule", () => {
    expect(mapRecommendationKeyToDraftType("answer-capsule")).toBe("answer_capsule");
  });

  it("maps fan-out-content → fan_out_content", () => {
    expect(mapRecommendationKeyToDraftType("fan-out-content")).toBe("fan_out_content");
  });

  it("maps topical-gap-article → topical_gap_article", () => {
    expect(mapRecommendationKeyToDraftType("topical-gap-article")).toBe("topical_gap_article");
  });

  it("maps outreach-brief → outreach_brief", () => {
    expect(mapRecommendationKeyToDraftType("outreach-brief")).toBe("outreach_brief");
  });

  it("maps how-to-guide → how_to_guide", () => {
    expect(mapRecommendationKeyToDraftType("how-to-guide")).toBe("how_to_guide");
  });

  it("maps listicle → listicle (no change)", () => {
    expect(mapRecommendationKeyToDraftType("listicle")).toBe("listicle");
  });

  it("falls back to expert_article for unknown keys", () => {
    expect(mapRecommendationKeyToDraftType("unknown-key")).toBe("expert_article");
  });

  it("never uses string equality between recommendation_key and draft_type", () => {
    const allKeys = [
      "wikipedia-article", "comparison-article", "faq-block", "press-release",
      "reddit-absence", "linkedin-presence", "linkedin-article", "answer-capsule",
      "fan-out-content", "topical-gap-article", "outreach-brief", "how-to-guide",
    ];
    for (const key of allKeys) {
      const draftType = mapRecommendationKeyToDraftType(key);
      expect(draftType).not.toBe(key);
    }
  });
});

describe("content-generator — selectModel usage", () => {
  it("generate-content-draft Inngest function uses selectModel with content_draft", () => {
    const source = fs.readFileSync(
      path.resolve("inngest/functions/generate-content-draft.ts"),
      "utf-8",
    );
    expect(source).toContain("selectModel(");
    expect(source).toContain("content_draft");
    expect(source).not.toMatch(/'claude-3|'gpt-4|'gemini-/);
  });
});

describe("content-generator — generateContentDraft source verification", () => {
  const source = fs.readFileSync(
    path.resolve("lib/workflow/content-generator.ts"),
    "utf-8",
  );

  it("uses selectModel with content_draft task", () => {
    expect(source).toContain('const task: ModelTask = "content_draft"');
  });

  it("calls getLLMService() for LLM access", () => {
    expect(source).toContain("getLLMService()");
  });

  it("calls selectContentFormat for format selection", () => {
    expect(source).toContain("selectContentFormat(");
  });

  it("inserts into contentDrafts with status draft", () => {
    expect(source).toContain('status: "draft"');
  });

  it("falls back to expert_article when recommendationKey is null", () => {
    expect(source).toContain('"expert_article"');
  });

  it("RECOMMENDATION_KEY_TO_DRAFT_TYPE has exactly 13 entries", () => {
    const entries = source
      .split("\n")
      .filter((l) => l.match(/^\s+"[\w-]+":\s+"[\w_]+"/));
    expect(entries).toHaveLength(13);
  });

  it("buildDraftPrompt includes format and draftType in the prompt", () => {
    expect(source).toContain("${format}");
    expect(source).toContain("${draftType}");
  });

  it("buildDraftPrompt conditionally includes description", () => {
    expect(source).toContain("description ?");
  });
});
