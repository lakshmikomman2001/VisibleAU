/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 6 -- the privacy policy says what the code does (a draft for
 * Sri's review, not legal advice):
 * - an audit's questions never carry the domain (lib/prompts/build-prompt-pack.ts ignores it); the business's
 *   name is in the branded questions, and a confirmed location's city and state go to ChatGPT's and Claude's
 *   web search (lib/brands/region-label.ts buildEngineLocation). The domain goes to Claude once, with the home
 *   page's title, description and main heading, when a business is added (lib/brands/classify-brand.ts);
 * - no retention period the code doesn't enforce: the retention job can't delete audits (foreign keys with no
 *   ON DELETE rule), closing a workspace deletes nothing, and evidence snapshots and the answer cache are
 *   never purged -- so questions and answers are kept until the customer asks for them to be deleted;
 * - the AI providers are named, as the Data Residency page names them (lib/governance/residency-config.ts).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { RESIDENCY_CONFIG } from "@/lib/governance/residency-config";

let policy = "";

beforeAll(async () => {
  const Page = (await import("@/app/(marketing)/privacy/page")).default;
  policy = renderToStaticMarkup(Page())
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}, 60_000);

/** The sentence of the policy that starts with `start`. */
function sentence(start: string): string {
  const at = policy.indexOf(start);
  expect(at, `no sentence starting "${start}"`).toBeGreaterThanOrEqual(0);
  return policy.slice(at, policy.indexOf(". ", at) + 1);
}

describe("what an audit sends", () => {
  it("questions naming the kind of business, the area and the business -- never the domain", () => {
    const audit = sentence("When you run an audit");
    expect(audit).toContain("questions your customers might ask");
    expect(audit).toContain("a few questions that name your business");
    expect(audit).not.toMatch(/domain|website/i);
  });

  it("a confirmed location's city and state, to ChatGPT's and Claude's web search", () => {
    expect(policy).toContain(
      "Once you've confirmed your business's location, its city and state also go to ChatGPT's and Claude's web search as an approximate location.",
    );
  });

  it("the domain goes to Claude once, when a business is added, with its home page's title, description and main heading", () => {
    expect(sentence("When you add a business")).toBe(
      "When you add a business, we send its name and website address, with its home page's title, description and main heading, to Anthropic (Claude) to work out what kind of business it is.",
    );
  });
});

describe("how long questions and answers are kept", () => {
  it("until the customer asks for them to be deleted: no period the code doesn't enforce", () => {
    expect(policy).toContain(
      "The questions we send to the AI providers, and their answers, are saved with your audit results. We keep them until you ask us to delete them.",
    );
    expect(policy).not.toMatch(/\b\d+\s*(hours?|days?|weeks?|months?|years?)\b/i);
    expect(policy).not.toMatch(/life of your account/i);
  });
});

describe("the AI providers, as the Data Residency page lists them", () => {
  it("OpenAI, Anthropic, Google and Perplexity, in the United States, under their API terms", () => {
    const providers = RESIDENCY_CONFIG.filter((r) => r.dataType.startsWith("llm_processing_"));
    expect(providers.map((r) => r.provider).sort()).toEqual([
      "anthropic",
      "google",
      "openai",
      "perplexity",
    ]);
    expect(new Set(providers.map((r) => r.storageRegion))).toEqual(new Set(["US"]));
    expect(policy).toContain(
      "processed by OpenAI (ChatGPT), Anthropic (Claude), Google (Gemini) and Perplexity through their APIs, in the United States, under each provider's API data-usage terms.",
    );
  });
});
