/**
 * ⚠️ UU — the Meta Tags display must use the scorer's real weights
 * (4/3/3/2/2), not its own hardcoded copy (3/3/3/3/2, task TT), and must
 * show honest present-but-imperfect messages for Description/Open Graph
 * instead of a flat "absent"-looking zero.
 */
import { describe, expect, it } from "vitest";
import type { CrawlResult } from "@/lib/crawler/types";
import { META_WEIGHTS, scoreMeta } from "@/lib/technical-audit/orchestrate";
import {
  describeFailingMetaRow,
  hasGranularMetaFields,
} from "@/app/(auth)/brands/[brandId]/meta-tags/page";

function crawlWithHtml(html: string, title = "Bondi Plumbing | Plumber Bondi | Blocked Drains"): CrawlResult {
  return {
    domain: "bondiplumbing.com.au",
    pages: [
      {
        url: "https://www.bondiplumbing.com.au/",
        statusCode: 200,
        title,
        textContent: "",
        wordCount: 1200,
        excerpt: "",
        byline: null,
        html,
        headers: {},
      },
    ],
    robotsTxt: null,
    sitemapXml: null,
    crawledAt: new Date(),
    errors: [],
  };
}

// Bondi's real, live-confirmed shape (task TT): description 184 chars
// (>160, too long), og:title + og:description present, og:image missing,
// canonical present, no hreflang.
const BONDI_DESCRIPTION =
  "Bondi Plumbing has been servicing Bondi since 1995. Our emergency plumbing service is genuine operating 24/7 for all your blocked drains, hot water & gas fitting issues CALL 9023 3243.";
const BONDI_HTML = `
  <html><head>
    <meta name="description" content="${BONDI_DESCRIPTION}">
    <meta property="og:title" content="Bondi Plumbing">
    <meta property="og:description" content="${BONDI_DESCRIPTION}">
    <link rel="canonical" href="https://www.bondiplumbing.com.au/">
  </head><body></body></html>
`;

describe("⚠️ UU — scoreMeta: real weights + granular state", () => {
  it("META_WEIGHTS is the single source of truth: 4/3/3/2/2", () => {
    expect(META_WEIGHTS).toEqual({ title: 4, description: 3, og: 3, canonical: 2, hreflang: 2 });
  });

  it("Bondi's real shape: 6/14, with granular detail explaining each failing row", () => {
    const { score, findings } = scoreMeta(crawlWithHtml(BONDI_HTML));

    expect(score).toBe(6); // 4 (title) + 0 + 0 + 2 (canonical) + 0 = 6, unchanged by this task
    expect(findings.titlePresent).toBe(true);
    expect(findings.canonicalPresent).toBe(true);
    expect(findings.hreflangPresent).toBe(false);

    // Description: present, but too long -- not absent.
    expect(findings.descriptionPresent).toBe(false);
    expect(findings.descriptionLength).toBe(184);
    expect(findings.descriptionVerdict).toBe("too_long");

    // Open Graph: 2 of 3 present -- not absent.
    expect(findings.ogPresent).toBe(false);
    expect(findings.ogTitle).toBe(true);
    expect(findings.ogDesc).toBe(true);
    expect(findings.ogImage).toBe(false);
  });

  it("a fully-passing page scores every row at its real max (4/4, 2/2, not 3/3)", () => {
    const goodDesc = "A".repeat(100); // within 50-160
    const html = `
      <html><head>
        <meta name="description" content="${goodDesc}">
        <meta property="og:title" content="x">
        <meta property="og:description" content="x">
        <meta property="og:image" content="https://x.com/img.png">
        <link rel="canonical" href="https://x.com/">
        <link rel="alternate" hreflang="en-au" href="https://x.com/">
      </head></html>
    `;
    const { score, findings } = scoreMeta(crawlWithHtml(html));
    expect(score).toBe(14);
    expect(findings).toMatchObject({
      titlePresent: true,
      descriptionPresent: true,
      descriptionVerdict: "ok",
      ogPresent: true,
      ogTitle: true,
      ogDesc: true,
      ogImage: true,
      canonicalPresent: true,
      hreflangPresent: true,
    });
  });

  it("description too short is distinguished from too long and from missing", () => {
    const html = `<html><head><meta name="description" content="short"></head></html>`;
    const { findings } = scoreMeta(crawlWithHtml(html));
    expect(findings.descriptionPresent).toBe(false);
    expect(findings.descriptionVerdict).toBe("too_short");
    expect(findings.descriptionLength).toBe(5);
  });

  it("no description at all -> verdict 'missing', not 'too_short'", () => {
    const html = `<html><head></head></html>`;
    const { findings } = scoreMeta(crawlWithHtml(html));
    expect(findings.descriptionPresent).toBe(false);
    expect(findings.descriptionVerdict).toBe("missing");
    expect(findings.descriptionLength).toBe(0);
  });
});

describe("⚠️ UU — meta-tags page: weights imported, honest messaging, legacy fallback", () => {
  it("describeFailingMetaRow: description present-but-too-long names the real length", () => {
    const { findings } = scoreMeta(crawlWithHtml(BONDI_HTML));
    const msg = describeFailingMetaRow("descriptionPresent", findings);
    expect(msg).toBe("Present but too long — 184 chars (aim for 50–160)");
  });

  it("describeFailingMetaRow: Open Graph 2-of-3 names what's missing", () => {
    const { findings } = scoreMeta(crawlWithHtml(BONDI_HTML));
    const msg = describeFailingMetaRow("ogPresent", findings);
    expect(msg).toBe("2 of 3 present — add og:image");
  });

  it("describeFailingMetaRow: genuinely missing description/OG returns null (no fabricated detail)", () => {
    const { findings } = scoreMeta(crawlWithHtml("<html><head></head></html>"));
    expect(describeFailingMetaRow("descriptionPresent", findings)).toBeNull();
    expect(describeFailingMetaRow("ogPresent", findings)).toBeNull();
  });

  it("describeFailingMetaRow: a passing row (no failure) returns null", () => {
    const { findings } = scoreMeta(crawlWithHtml(BONDI_HTML));
    expect(describeFailingMetaRow("titlePresent", findings)).toBeNull();
    expect(describeFailingMetaRow("canonicalPresent", findings)).toBeNull();
  });

  it("hasGranularMetaFields: true for a fresh scoreMeta result, false for a legacy (boolean-only) record", () => {
    const { findings } = scoreMeta(crawlWithHtml(BONDI_HTML));
    expect(hasGranularMetaFields(findings)).toBe(true);

    const legacy = {
      score: 6,
      titlePresent: true,
      descriptionPresent: false,
      ogPresent: false,
      canonicalPresent: true,
      hreflangPresent: false,
    };
    expect(hasGranularMetaFields(legacy)).toBe(false);
    expect(hasGranularMetaFields(undefined)).toBe(false);
  });
});
