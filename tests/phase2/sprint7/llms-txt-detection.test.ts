/**
 * ⚠️ Z — llms.txt detection must reject a soft-404's HTML body.
 *
 * Task Y found `lib/technical-audit/orchestrate.ts` treated ANY 2xx response
 * from /llms.txt as "present" (`if (r.ok) llmsTxtContent = await r.text()`),
 * with no content-type or body-shape check. bondiplumbing.com.au has no
 * llms.txt at all -- the URL soft-404s to the site's own HTML homepage --
 * yet the Technical Audit scored it 9/18 ("present" + "depth" + likely
 * "fullTxt", since a real webpage is almost always >1500 chars and the
 * identical bug applied to /llms-full.txt).
 *
 * isPlainTextLlmsFile (the fetch-site gate) and scoreLlmsTxtDepth's own
 * HTML guard (defense in depth, in case a bad body reaches it some other
 * way) must both make an HTML body score exactly 0.
 */
import { describe, expect, it } from "vitest";
import { isPlainTextLlmsFile, scoreLlmsTxtDepth } from "@/lib/llms-txt/depth-score";

// A realistic soft-404: a real Next.js page shell, easily >1500 chars, no
// markdown H1/blockquote/H2/link syntax of its own.
const SOFT_404_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Bondi Plumbing — Sydney's trusted local plumber</title>
<meta name="description" content="24/7 emergency plumbing across Bondi and the Eastern Suburbs." />
<link rel="stylesheet" href="/_next/static/css/app.css" />
</head>
<body>
<div id="__next">
<header><nav><a href="/">Home</a><a href="/services">Services</a><a href="/contact">Contact</a></nav></header>
<main>
<h1>Bondi Plumbing</h1>
<p>Sydney's trusted local plumber, serving the Eastern Suburbs for over 15 years. Call us for emergency repairs,
blocked drains, hot water systems, and bathroom renovations. Fully licensed and insured.</p>
<section><h2>Our services</h2><ul><li>Emergency plumbing</li><li>Blocked drains</li><li>Hot water systems</li></ul></section>
<footer><p>&copy; 2026 Bondi Plumbing. All rights reserved.</p></footer>
</main>
</div>
<!-- A real page ships far more markup than this shell -- head tags, inlined
     critical CSS, framework boilerplate -- easily past 1500 chars, the exact
     size that made "depth" fire alongside "present" for the real bug.
     A real page ships far more markup than this shell -- head tags, inlined
     critical CSS, framework boilerplate -- easily past 1500 chars, the exact
     size that made "depth" fire alongside "present" for the real bug.
     A real page ships far more markup than this shell -- head tags, inlined
     critical CSS, framework boilerplate -- easily past 1500 chars, the exact
     size that made "depth" fire alongside "present" for the real bug. -->
<script src="/_next/static/chunks/main.js"></script>
</body>
</html>`;

const REAL_LLMS_TXT = `# Bondi Plumbing

> Sydney's trusted local plumber, serving the Eastern Suburbs for over 15 years.

## Services

We offer emergency plumbing, blocked drains, hot water systems, and bathroom renovations.
See our [services page](https://bondiplumbing.com.au/services) for full details, our
[pricing guide](https://bondiplumbing.com.au/pricing), and [service areas](https://bondiplumbing.com.au/areas).

## About

Bondi Plumbing has been operating since 2011. Read [our story](https://bondiplumbing.com.au/about) and
[customer reviews](https://bondiplumbing.com.au/reviews).

## Contact

Call 24/7 or [book online](https://bondiplumbing.com.au/book). ${"Extra padding to clear the 1500 character depth threshold reliably. ".repeat(15)}

## Licensing

Fully licensed and insured under NSW Fair Trading.
`;

describe("⚠️ Z — isPlainTextLlmsFile (the fetch-site gate)", () => {
  it("a soft-404's text/html content-type is rejected outright", () => {
    expect(isPlainTextLlmsFile("text/html; charset=utf-8", SOFT_404_HTML)).toBe(false);
  });

  it("a real text/plain llms.txt is accepted", () => {
    expect(isPlainTextLlmsFile("text/plain; charset=utf-8", REAL_LLMS_TXT)).toBe(true);
  });

  it("text/markdown is also accepted (a valid llms.txt content-type)", () => {
    expect(isPlainTextLlmsFile("text/markdown", REAL_LLMS_TXT)).toBe(true);
  });

  it("a server that mislabels HTML as text/plain is still caught by the body-shape backstop", () => {
    expect(isPlainTextLlmsFile("text/plain", SOFT_404_HTML)).toBe(false);
  });

  it("missing content-type is rejected (never silently trusted)", () => {
    expect(isPlainTextLlmsFile(null, REAL_LLMS_TXT)).toBe(false);
  });

  it("an unrelated content-type (e.g. application/json) is rejected", () => {
    expect(isPlainTextLlmsFile("application/json", '{"ok":true}')).toBe(false);
  });
});

describe("⚠️ Z — scoreLlmsTxtDepth: HTML can never score non-zero (defense in depth)", () => {
  it("regression: the exact Bondi bug — a soft-404 HTML body scores 0, not 9", () => {
    // Pre-fix, this body alone was enough to hit present + depth (+ fullTxt
    // when the same HTML also passed for llms-full.txt) = 9/18.
    const result = scoreLlmsTxtDepth(SOFT_404_HTML, SOFT_404_HTML);
    expect(result.score).toBe(0);
    expect(result.components).toEqual({
      present: false,
      h1Blockquote: false,
      sections: false,
      links: false,
      depth: false,
      fullTxt: false,
    });
  });

  it("HTML as only the fullTxt companion (main content real) never credits fullTxt", () => {
    const result = scoreLlmsTxtDepth(REAL_LLMS_TXT, SOFT_404_HTML);
    expect(result.components.fullTxt).toBe(false);
  });

  it("null/empty content still scores 0 across all components", () => {
    expect(scoreLlmsTxtDepth(null, null).score).toBe(0);
    expect(scoreLlmsTxtDepth("", null).score).toBe(0);
  });

  it("a real, well-formed llms.txt scores full marks", () => {
    const bigFullTxt = REAL_LLMS_TXT.repeat(3);
    const result = scoreLlmsTxtDepth(REAL_LLMS_TXT, bigFullTxt);
    expect(result.components).toEqual({
      present: true,
      h1Blockquote: true,
      sections: true,
      links: true,
      depth: true,
      fullTxt: true,
    });
    expect(result.score).toBe(18);
  });
});
