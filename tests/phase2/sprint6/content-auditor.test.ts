import { describe, it, expect } from "vitest";
import { auditContentStructure } from "@/lib/retrieval/content-auditor";
import type { CrawlPage } from "@/lib/crawler/types";

function makePage(overrides: Partial<CrawlPage> = {}): CrawlPage {
  return {
    url: "https://example.com/test",
    statusCode: 200,
    title: "Test Page",
    textContent: "Some test content here for testing purposes",
    wordCount: 500,
    excerpt: "Test excerpt",
    byline: null,
    html: "<html><body><h1>Test</h1><h2>Section</h2><p>Content</p></body></html>",
    headers: {},
    ...overrides,
  };
}

describe("auditContentStructure", () => {
  it("returns valid structure for basic page", () => {
    const result = auditContentStructure(makePage());
    expect(result).toHaveProperty("answerCapsuleScore");
    expect(result).toHaveProperty("faqBlockPresent");
    expect(result).toHaveProperty("faqSchemaPresent");
    expect(result).toHaveProperty("headingStructure");
    expect(result).toHaveProperty("wordCount");
    expect(result).toHaveProperty("freshnessRisk");
    expect(result).toHaveProperty("contentFormatDetected");
    expect(result).toHaveProperty("outboundCitationCount");
    expect(result).toHaveProperty("hasAuthorAttribution");
  });

  it("detects FAQ schema when present", () => {
    const page = makePage({
      html: `<html><script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question"}]}</script></html>`,
    });
    const result = auditContentStructure(page);
    expect(result.faqSchemaPresent).toBe(true);
  });

  it("counts words from textContent", () => {
    const result = auditContentStructure(makePage({ textContent: "word ".repeat(50) }));
    expect(result.wordCount).toBe(50);
  });

  it("detects author attribution from byline", () => {
    const result = auditContentStructure(makePage({ byline: "John Smith" }));
    expect(result.hasAuthorAttribution).toBe(true);
  });

  it("freshness defaults to stale when no lastModifiedDate", () => {
    const result = auditContentStructure(makePage());
    expect(result.freshnessRisk).toBe("stale");
  });

  it("freshness is fresh for recent lastModifiedDate", () => {
    const result = auditContentStructure(makePage(), new Date());
    expect(result.freshnessRisk).toBe("fresh");
  });
});
