/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2 -- our checks never pretend to be another company's
 * crawler. Four checks (llms.txt generate and refresh, agent readiness, content structure, entity home) passed
 * userAgent "GPTBot/1.1", and CDN Shield probed as GPTBot, ClaudeBot, Googlebot and PerplexityBot. A site's
 * logs and blocks then blamed those companies for our visits. This scan fails on any of it in shipped code:
 *
 * - a crawler's user agent with a version ("GPTBot/1.1", "ClaudeBot/1.0", "Googlebot/2.1") anywhere -- the
 *   allowlists in a remediation snippet name crawlers without one, as robots.txt and WAF rules do;
 * - a `User-Agent` header whose value isn't ours: lib/product.ts CRAWLER_USER_AGENT (or the crawler's
 *   DEFAULT_UA / `ua`, which is it), or one of the two named below, each ours;
 * - a `userAgent` passed to crawlSite (CrawlOptions has none: tests/unit/crawler/user-agent.test.ts checks a
 *   crawl still sends ours if one is slipped in).
 */
import { describe, expect, it } from "vitest";
import { NON_TEST_ROOTS, readSourcesBeforeAll, sourceFiles } from "@/tests/helpers/source-files";

readSourcesBeforeAll([...NON_TEST_ROOTS]);

const CRAWLER_TOKENS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Googlebot",
  "Google-Extended",
  "GoogleOther",
  "bingbot",
  "Bytespider",
  "CCBot",
  "Applebot",
  "Amazonbot",
  "FacebookBot",
  "meta-externalagent",
];
const VERSIONED_CRAWLER_UA = new RegExp(`\\b(${CRAWLER_TOKENS.join("|")})\\/\\d`, "i");

/** A User-Agent header and the expression it's set to. */
// A template literal to its closing backtick; anything else to the next comma, brace or space.
const UA_HEADER = /["']User-Agent["']\s*:\s*(`[^`]*`|[^,}\s]+)/gi;

/** The values a User-Agent header may have: ours. */
const OUR_UA = new Set(["CRAWLER_USER_AGENT", "DEFAULT_UA", "ua"]);
/** Two of ours with their own wording, each with why. */
const OUR_OTHER_UA: Array<{ file: string; value: string; why: string }> = [
  {
    file: "lib/brand-entity/wikipedia-au.ts",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the template's source text, as it appears in the file
    value: "`${PRODUCT_NAME}/1.0 (https://${CONTACT_DOMAIN}; ${CONTACT_EMAIL})`",
    why: "Wikimedia's User-Agent policy asks for the client's name and a contact address",
  },
  {
    file: "lib/webhooks/deliver.ts",
    value: '"VisibleAU-Webhook/1.0"',
    why: "our webhook deliveries; receivers may match on it, beside the X-VisibleAU-* signature headers",
  },
];

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const shipped = () =>
  sourceFiles([...NON_TEST_ROOTS]).map((f) => ({ path: f.path, code: stripComments(f.text) }));

describe("no request we send borrows another company's crawler name", () => {
  it("scans the shipped code (it reads something)", () => {
    expect(shipped().length).toBeGreaterThan(300);
  });

  it("no crawler user agent with a version, anywhere in shipped code", () => {
    const found = shipped().flatMap(({ path, code }) =>
      code
        .split("\n")
        .filter((line) => VERSIONED_CRAWLER_UA.test(line))
        .map((line) => `${path}: ${line.trim()}`),
    );
    expect(found).toEqual([]);
  });

  it("every User-Agent header we set is ours", () => {
    const found: string[] = [];
    for (const { path, code } of shipped()) {
      for (const m of code.matchAll(UA_HEADER)) {
        const value = m[1].trim();
        const ours =
          OUR_UA.has(value) || OUR_OTHER_UA.some((o) => o.file === path && o.value === value);
        if (!ours) found.push(`${path}: User-Agent ${value}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("the two of ours with their own wording are still there (the list can't rot)", () => {
    const files = new Map(shipped().map((f) => [f.path, f.code]));
    for (const o of OUR_OTHER_UA) {
      expect(files.get(o.file), o.file).toContain(o.value);
      expect(o.why.length).toBeGreaterThan(10);
    }
  });

  it("no crawlSite call passes a userAgent", () => {
    const found = shipped().flatMap(({ path, code }) =>
      [...code.matchAll(/crawlSite\([^)]*\{[^}]*userAgent/g)].map(() => path),
    );
    expect(found).toEqual([]);
  });

  it("the patterns catch what they're for (they aren't vacuous)", () => {
    for (const ua of ['userAgent: "GPTBot/1.1",', '{ ua: "ClaudeBot/1.0" }', '"Googlebot/2.1"']) {
      expect(VERSIONED_CRAWLER_UA.test(ua), ua).toBe(true);
    }
    expect(VERSIONED_CRAWLER_UA.test("GPTBot|ChatGPT-User|ClaudeBot")).toBe(false);
    const header = [...'headers: { "User-Agent": "GPTBot/1.1" },'.matchAll(UA_HEADER)];
    expect(header[0]?.[1].trim()).toBe('"GPTBot/1.1"');
  });
});
