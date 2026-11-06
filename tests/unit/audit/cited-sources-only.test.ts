/**
 * "Mention detection" (6 Nov), Sri's decision 1 -- every surface that counts what "AI cited" counts only the
 * sources an answer actually cited. A Claude search result the answer didn't cite is stored with
 * "cited": false (lib/audit/extract-citations.ts mergeCitedSources) and is never counted -- not as a source
 * of a mention, not as a directory citation -- for any engine. (Share of voice no longer reads sources at
 * all since 7 Nov: lib/visibility/share-of-voice.ts counts mentions of the brand and its competitors.)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { citedSourcesOf } from "@/lib/audit/extract-citations";
import { selectOrganicCitations } from "@/lib/audit/organic-citations";
import { accuracyDimensionScore } from "@/lib/scoring/accuracy";

const cited = { domain: "hipages.com.au", url: "https://hipages.com.au/x", origin: "retrieved" };
const searchOnly = {
  domain: "yelp.com",
  url: "https://yelp.com/x",
  origin: "retrieved",
  cited: false,
};

describe("citedSourcesOf", () => {
  it("drops only the search results the answer didn't cite", () => {
    expect(citedSourcesOf([cited, searchOnly, { ...cited, cited: true }])).toEqual([
      cited,
      { ...cited, cited: true },
    ]);
  });

  it("a row from before the flag counts every entry; anything not an array is no sources", () => {
    const legacy = [{ domain: "a.com.au", url: "https://a.com.au" }, "https://b.com.au"];
    expect(citedSourcesOf(legacy)).toEqual(legacy);
    expect(citedSourcesOf(null)).toEqual([]);
    expect(citedSourcesOf({ domain: "x" })).toEqual([]);
  });
});

describe("a mention 'with a source' needs a source the answer cited", () => {
  const mention = (citedSources: unknown) => ({
    brandMentioned: true,
    mentionVerification: "verified_location",
    citedSources,
  });

  it("accuracy: search results alone are no source", () => {
    expect(accuracyDimensionScore([mention([searchOnly])])).toBe(0);
    expect(accuracyDimensionScore([mention([searchOnly, cited])])).toBe(100);
  });

  it("the organic aggregate's mentions-with-sources count", () => {
    const outcome = (citedSources: unknown) => ({
      isBranded: false,
      brandMentioned: true,
      position: null,
      mentionVerification: "verified_location",
      sentimentLabel: "neutral",
      contextLabel: "listed",
      citedSources,
      runNumber: 1,
    });
    const aggregates = selectOrganicCitations([outcome([searchOnly]), outcome([cited])]);
    expect(aggregates.distinctAccWithSourcesCount).toBe(1);
  });
});

describe("no reader counts cited_sources entries without the cited-only rule", () => {
  // The writers (the two runners), the merge that sets the flag, and verifyMention (which reads
  // `cited` itself) are the only code that may touch the entries directly.
  const ALLOWED = new Set([
    "lib/audit/extract-citations.ts",
    "lib/audit/verify-mention.ts",
    "lib/audit/run-audit-inline.ts",
    "inngest/functions/run-audit.ts",
  ]);
  const RAW_READ =
    /Array\.isArray\([\w.]*citedSources\)|\.citedSources as |jsonb_array_length\(\$\{citations\.citedSources\}\)|\$\{citations\.citedSources\} @>/;

  it("every other file reads them through citedSourcesOf or citedSourcesSql", () => {
    const files = execFileSync("git", ["ls-files", "lib", "app", "inngest", "components"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f) && !ALLOWED.has(f));
    const offenders = files.filter((f) => RAW_READ.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
