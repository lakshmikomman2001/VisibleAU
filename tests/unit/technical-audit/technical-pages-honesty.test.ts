/**
 * 17 Nov, part 3 -- the technical pages say only what the audit measured:
 * - llms.txt generator: "Sitemap.xml present: Yes · bonus" was hard-coded; the AI files read `?? false`.
 * - Meta tags: only the home page is checked, and the page says so; a tag not recorded is "Not checked".
 * - Signals: the score is higher-is-better (it said "Lower is better"); with no stored list it's "Not checked".
 * - Technical audit: Signals is negative signals only (it said "+ prompt injection").
 * - AI discovery: with no findings each row is "Not checked", not a cross and 0.
 * - Answer capsules: an audit with no per-question data reads "Not measured yet", not 0 / 0 / 0 with a green 0.
 * - robots.txt: no "CDN Blocking Detected" (no check could set it), no "Default" tick for unchecked crawlers.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDiscoveryChecks } from "@/app/(auth)/brands/[brandId]/llms-txt-generator/page";

const page = (name: string) => readFileSync(`app/(auth)/brands/[brandId]/${name}/page.tsx`, "utf8");
/** The code without comments, so a comment quoting the old copy doesn't count. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

describe("llms.txt generator: the discovery rows come from the audit", () => {
  it("a found sitemap is 'Yes', a 404 'Not found', a 5xx 'Couldn't check', none stored 'Not checked'", () => {
    const sitemap = (status: "found" | "absent" | "unreachable") => ({
      url: "https://acme.com.au/sitemap.xml",
      status,
      httpStatus: status === "found" ? 200 : status === "absent" ? 404 : 503,
    });
    const row = (s: Parameters<typeof buildDiscoveryChecks>[0]) =>
      buildDiscoveryChecks(s, undefined, false)[0];
    expect(row(sitemap("found"))).toMatchObject({ state: "yes", text: "Yes · bonus" });
    expect(row(sitemap("absent"))).toMatchObject({ state: "no", text: "Not found" });
    expect(row(sitemap("unreachable"))).toMatchObject({
      state: "unchecked",
      text: "Couldn't check",
    });
    expect(row(undefined)).toMatchObject({ state: "unchecked", text: "Not checked on this audit" });
  });

  it("the AI files: no AI-discovery result is 'Not checked', never 'Not found'", () => {
    const rows = buildDiscoveryChecks(undefined, undefined, false);
    expect(rows.slice(1).every((r) => r.state === "unchecked")).toBe(true);
    const measured = buildDiscoveryChecks(
      undefined,
      { aiTxtPresent: true, aiSummaryPresent: false, aiFaqPresent: false },
      false,
    );
    expect(measured[1]).toMatchObject({ state: "yes" });
    // 19 Nov: the /ai/ files are optional and scored 0, and say so.
    expect(measured[2]).toMatchObject({ state: "no", text: "Not found · optional, not scored" });
  });

  it("on a crawl that never reached the site, every row says so", () => {
    const rows = buildDiscoveryChecks(undefined, undefined, true);
    expect(rows.every((r) => r.text === "Not checked: site not reached")).toBe(true);
  });

  it("no hard-coded 'present: true' and no `?? false` left on the page", () => {
    const src = code(page("llms-txt-generator"));
    expect(src).not.toMatch(/present: true,/);
    expect(src).not.toMatch(/Present \?\? false/);
    // a timeout is "couldn't check", not "Not started" at 0
    expect(src).toMatch(/findings\?\.fetchStatus === "unreachable"/);
  });
});

describe("meta tags: home page only, said on the page", () => {
  const src = code(page("meta-tags"));
  it("names the home page and has no `?? false` for a tag", () => {
    expect(src).toMatch(/on your home page/);
    expect(src).toMatch(/Only the home page is checked/);
    expect(src).not.toMatch(/findings\?\.\[sig\.key\] \?\? false/);
  });
});

describe("signals", () => {
  const src = code(page("signals"));
  it("says higher is better (the score starts at 6 and loses points), never 'Lower is better'", () => {
    expect(src).not.toMatch(/Lower is better/);
    expect(src).toMatch(/so higher is better/);
    expect(src).toMatch(/Crawled \{crawledOn\}/);
  });

  it("a missing list is not checked (null), never [] -> 'No negative signals detected'", () => {
    expect(src).not.toMatch(/negativeSignals \?\? \[\]/);
    expect(src).toMatch(/Array\.isArray\(storedSignals\)/);
  });
});

describe("technical audit summary", () => {
  const src = code(page("technical-audit"));
  it("the Signals row says prompt injection isn't scored", () => {
    expect(src).not.toMatch(/Negative signals \+ prompt injection/);
    expect(src).toMatch(/Negative signals \(prompt injection is listed, not scored\)/);
  });

  it("the change from the last audit names its date and compares like with like", () => {
    expect(src).not.toMatch(/vs last`/);
    expect(src).toMatch(/comparableCompositeDelta\(/);
    expect(src).toMatch(/vs \$\{dayOf\(prevAudit\.createdAt\)\}/);
  });
});

describe("AI discovery", () => {
  const src = code(page("ai-discovery"));
  it("a row with no stored result is 'Not checked', and the crawl date is shown", () => {
    expect(src).not.toMatch(/findings\?\.\[ep\.key\] \?\? false/);
    expect(src).toMatch(/const checked = typeof stored === "boolean"/);
    expect(src).toMatch(/Checked \{crawledOn\}/);
  });
});

describe("answer capsules", () => {
  const src = code(page("answer-capsules"));
  it("no 0 / 0 / 0 from an audit without per-question data", () => {
    expect(src).toMatch(/const counted = hasQuestionsField && !unreached/);
    expect(src).not.toMatch(/answerCapsulesFound \?\? 0/);
    // green only when there were questions and all have capsules
    expect(src).toMatch(/: total > 0\s*\?\s*"var\(--success\)"/);
  });
});

describe("robots.txt", () => {
  const src = code(page("robots-txt-config"));
  it("no 'CDN Blocking Detected', no 'Default' tick, and no claim the page catches CDN blocks", () => {
    expect(src).not.toMatch(/CDN Blocking Detected/);
    expect(src).not.toMatch(/"Default"/);
    expect(src).not.toMatch(/Catch CDN-level blocks/);
    expect(src).toMatch(/botStatusLabel\(row\)/);
  });
});
