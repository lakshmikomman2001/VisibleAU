import { describe, it, expect } from "vitest";
import { auditEntityHome } from "@/lib/retrieval/entity-home-auditor";
import type { CrawlPage } from "@/lib/crawler/types";

function makePage(url: string, html: string): CrawlPage {
  return {
    url,
    statusCode: 200,
    title: "Test",
    textContent: "",
    wordCount: 100,
    excerpt: "",
    byline: null,
    html,
    headers: {},
  };
}

describe("auditEntityHome", () => {
  it("detects entity home on /about page with Organisation schema", () => {
    const pages = [
      makePage("https://example.com/about", `
        <script type="application/ld+json">
        {"@type": "Organization", "@id": "https://example.com", "sameAs": ["https://linkedin.com/x", "https://wikipedia.org/x", "https://wikidata.org/x"]}
        </script>
      `),
    ];
    const result = auditEntityHome("example.com", pages);
    expect(result.isEntityHomeCandidate).toBe(true);
    expect(result.entityHomeHasOrgSchema).toBe(true);
    expect(result.entityHomeHasIdField).toBe(true);
    expect(result.entityHomeSameAsCount).toBe(3);
    expect(result.gaps).toHaveLength(0);
  });

  it("reports gaps when no about page found", () => {
    const pages = [makePage("https://example.com/blog", "<html></html>")];
    const result = auditEntityHome("example.com", pages);
    expect(result.isEntityHomeCandidate).toBe(false);
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it("detects root URL as entity home", () => {
    const pages = [
      makePage("https://example.com/", `<script type="application/ld+json">{"@type":"Organization","@id":"https://example.com"}</script>`),
    ];
    const result = auditEntityHome("example.com", pages);
    expect(result.isEntityHomeCandidate).toBe(true);
    expect(result.entityHomeHasOrgSchema).toBe(true);
  });

  it("flags missing @id", () => {
    const pages = [
      makePage("https://example.com/about", `<script type="application/ld+json">{"@type":"Organization"}</script>`),
    ];
    const result = auditEntityHome("example.com", pages);
    expect(result.entityHomeHasIdField).toBe(false);
    expect(result.gaps).toContain("Organisation JSON-LD is missing @id. Add an @id pointing to your canonical domain.");
  });

  it("flags sameAs count < 3", () => {
    const pages = [
      makePage("https://example.com/about", `<script type="application/ld+json">{"@type":"Organization","@id":"https://example.com","sameAs":["https://a.com"]}</script>`),
    ];
    const result = auditEntityHome("example.com", pages);
    expect(result.entityHomeSameAsCount).toBe(1);
    expect(result.gaps.some((g) => g.includes("sameAs"))).toBe(true);
  });

  it("entity_clarity fields are page-structure-derived, independent of score_of_10", () => {
    const html = `<script type="application/ld+json">{"@type":"Organization","@id":"https://example.com","sameAs":["https://a.com","https://b.com","https://c.com"]}</script>`;
    const pages = [makePage("https://example.com/about", html)];
    const r1 = auditEntityHome("example.com", pages);
    const r2 = auditEntityHome("example.com", pages);
    expect(r1.entityHomeHasOrgSchema).toBe(r2.entityHomeHasOrgSchema);
    expect(r1.entityHomeHasIdField).toBe(r2.entityHomeHasIdField);
    expect(r1.entityHomeSameAsCount).toBe(r2.entityHomeSameAsCount);
    expect(r1.entityHomeSameAsCount).toBe(3);
    expect(r1.gaps).toHaveLength(0);
  });
});
