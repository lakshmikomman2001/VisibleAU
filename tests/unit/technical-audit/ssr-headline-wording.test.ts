/**
 * ⚠️ LLL — the SSR check's aggregate headline said "X of N pages have
 * server-rendered content," which implies the other pages render nothing.
 * In reality every "review" page still has real server-rendered content --
 * it's just thin (below the 300-word "good" bar), not absent. This proves
 * the headline now distinguishes substantial/good from thin, not
 * content from no-content, and that the single Good/Thin threshold
 * (SSR_CONTENT_THRESHOLDS) still drives both the per-row table and the
 * headline count.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("⚠️ LLL — SSR check headline: thin is not conflated with absent", () => {
  const src = readFileSync("app/(auth)/brands/[brandId]/ssr-check/page.tsx", "utf8");

  it("the old bare 'pages have server-rendered content' phrasing is gone", () => {
    expect(src).not.toMatch(/\d+ of \$\{ssrData\.pagesChecked\} pages have server-rendered content/);
    expect(src).not.toMatch(/critical pages have server-rendered content`/);
  });

  it("the headline says 'substantial' server-rendered content, and names the thin pages explicitly", () => {
    expect(src).toMatch(/pages have substantial server-rendered content/);
    expect(src).toMatch(/thin page\$\{pagesWithReview !== 1 \? "s" : ""\} need/);
  });

  it("the review-count derives from the same pagesChecked/pagesWithReview source as the per-row table, no second count", () => {
    expect(src).toMatch(/const goodPages = ssrData\.pagesChecked - pagesWithReview;/);
  });
});
