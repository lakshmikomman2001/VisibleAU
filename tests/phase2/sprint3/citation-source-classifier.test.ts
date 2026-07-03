import { describe, expect, it } from "vitest";
import {
  classifyCitedSources,
  classifySourceType,
  classifySourceTypeWithBrand,
  getEngineAffinity,
} from "@/lib/visibility/citation-source-classifier";

describe("citation-source-classifier", () => {
  it("classifies Reddit URLs", () => {
    expect(classifySourceType("https://reddit.com/r/australia/comments/abc")).toBe("reddit_thread");
  });

  it("classifies LinkedIn URLs", () => {
    expect(classifySourceType("https://linkedin.com/posts/someone")).toBe("linkedin_post");
  });

  it("classifies YouTube URLs", () => {
    expect(classifySourceType("https://youtube.com/watch?v=abc")).toBe("youtube_video");
    expect(classifySourceType("https://youtu.be/abc")).toBe("youtube_video");
  });

  it("classifies Wikipedia URLs", () => {
    expect(classifySourceType("https://en.wikipedia.org/wiki/Something")).toBe("wikipedia");
  });

  it("classifies AU directory URLs", () => {
    expect(classifySourceType("https://yellowpages.com.au/find/plumber")).toBe("au_directory");
    expect(classifySourceType("https://truelocal.com.au/business")).toBe("au_directory");
  });

  it("classifies review site URLs", () => {
    expect(classifySourceType("https://productreview.com.au/p/brand")).toBe("review_site");
    expect(classifySourceType("https://trustpilot.com/review/brand")).toBe("review_site");
  });

  it("classifies news URLs", () => {
    expect(classifySourceType("https://news.com.au/national/story")).toBe("news_article");
    expect(classifySourceType("https://abc.net.au/news/story")).toBe("news_article");
  });

  it("classifies brand-owned URLs", () => {
    expect(classifySourceTypeWithBrand("https://mybrand.com.au/about", "mybrand.com.au")).toBe("brand_owned");
  });

  it("returns 'other' for unrecognized URLs", () => {
    expect(classifySourceType("https://random-site.io/page")).toBe("other");
  });

  it("returns correct engine affinity", () => {
    expect(getEngineAffinity("reddit_thread")).toBe("perplexity_primary");
    expect(getEngineAffinity("linkedin_post")).toBe("chatgpt_primary");
    expect(getEngineAffinity("youtube_video")).toBe("gemini_primary");
    expect(getEngineAffinity("wikipedia")).toBe("all");
    expect(getEngineAffinity("other")).toBeNull();
  });

  it("classifies multiple cited sources at once", () => {
    const result = classifyCitedSources(
      [
        { url: "https://reddit.com/r/test" },
        { url: "https://mybrand.com.au/page" },
        { url: "https://random.com" },
      ],
      "mybrand.com.au",
    );

    expect(result).toHaveLength(3);
    expect(result[0].sourceType).toBe("reddit_thread");
    expect(result[1].sourceType).toBe("brand_owned");
    expect(result[2].sourceType).toBe("other");
  });
});
