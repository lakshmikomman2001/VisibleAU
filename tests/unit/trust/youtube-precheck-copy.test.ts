/**
 * Before any check has run (no youtube_presence_audits row at all), the
 * page must not assert a conclusion ("No YouTube channel found") that
 * hasn't actually been measured yet -- that copy belongs only to the
 * real "checked, none found" state (checkStatus === "not_found").
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("YouTube Presence page -- pre-check copy never asserts a conclusion", () => {
  const src = readFileSync("app/(auth)/brands/[brandId]/trust/youtube-presence/page.tsx", "utf8");

  it("the pre-check (!data) branch does not say 'No YouTube channel found'", () => {
    const noDataIndex = src.indexOf("if (!data)");
    const nextBranchIndex = src.indexOf("if (data.implemented === false)");
    const preCheckBlock = src.slice(noDataIndex, nextBranchIndex);
    expect(preCheckBlock).not.toMatch(/No .*channel found/i);
    expect(preCheckBlock).not.toContain("add your channel URL");
  });

  it("the pre-check branch says only that it hasn't been measured yet", () => {
    const noDataIndex = src.indexOf("if (!data)");
    const nextBranchIndex = src.indexOf("if (data.implemented === false)");
    const preCheckBlock = src.slice(noDataIndex, nextBranchIndex);
    expect(preCheckBlock).toMatch(/not (checked|measured) yet/i);
  });

  it("the real 'checked, none found' state (not_found) is the only place that concludes no channel was found", () => {
    const notFoundIndex = src.indexOf('data.checkStatus === "not_found"');
    expect(notFoundIndex).toBeGreaterThan(-1);
    const block = src.slice(notFoundIndex, notFoundIndex + 400);
    expect(block).toMatch(/No confirmed YouTube channel found/);
  });
});
