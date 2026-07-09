import { describe, it, expect } from "vitest";
import {
  classifyCrawlerTier,
  classifyVisitPurpose,
  isActiveAgentUserAgent,
  extractCrawlerName,
} from "@/lib/retrieval/visit-classifier";

describe("classifyCrawlerTier", () => {
  it("classifies GPTBot as must_allow", () => {
    expect(classifyCrawlerTier("GPTBot")).toBe("must_allow");
  });

  it("classifies ClaudeBot as must_allow", () => {
    expect(classifyCrawlerTier("ClaudeBot")).toBe("must_allow");
  });

  it("classifies CCBot as data", () => {
    expect(classifyCrawlerTier("CCBot")).toBe("data");
  });

  it("classifies unknown bot as emerging", () => {
    expect(classifyCrawlerTier("SomeNewBot")).toBe("emerging");
  });
});

describe("classifyVisitPurpose", () => {
  it("active agent is retrieval", () => {
    expect(classifyVisitPurpose(true, "must_allow", 1)).toBe("retrieval");
  });

  it("data tier non-active is training", () => {
    expect(classifyVisitPurpose(false, "data", 1)).toBe("training");
  });

  it("must_allow with >3 pages is indexing", () => {
    expect(classifyVisitPurpose(false, "must_allow", 5)).toBe("indexing");
  });

  it("must_allow with <=3 pages returns null", () => {
    expect(classifyVisitPurpose(false, "must_allow", 2)).toBeNull();
  });
});

describe("isActiveAgentUserAgent", () => {
  it("detects ChatGPT-User as active agent", () => {
    expect(isActiveAgentUserAgent("Mozilla/5.0 ChatGPT-User")).toBe(true);
  });

  it("GPTBot is NOT active agent (crawler, not user-facing)", () => {
    expect(isActiveAgentUserAgent("GPTBot/1.0")).toBe(false);
  });
});

describe("extractCrawlerName", () => {
  it("extracts GPTBot from UA string", () => {
    expect(extractCrawlerName("Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com)")).toBe("GPTBot");
  });

  it("extracts ClaudeBot from UA string", () => {
    expect(extractCrawlerName("ClaudeBot/1.0")).toBe("ClaudeBot");
  });

  it("returns Unknown for normal browser UA", () => {
    expect(extractCrawlerName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")).toBe("Unknown");
  });
});
