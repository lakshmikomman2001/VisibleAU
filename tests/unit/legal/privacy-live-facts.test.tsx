/**
 * 20 Nov (Sri's decision, part 4): the live privacy page changes only what the code shows is untrue or unverifiable --
 * "used solely to run AI visibility audits and deliver reports" (adding a business also sends its home page to
 * Anthropic), "We use these services under their respective data processing agreements" (no signed agreement is in the
 * repository or its docs), and a DataForSEO paragraph that didn't say the place each question is checked from is sent
 * too. Its sentences come from lib/legal/data-facts.ts and lib/marketing/google-ai.ts, the FAQ's sources. The full
 * picture is in docs/privacy-policy-draft.md, a draft for review, never published.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/governance/google-surfaces-env", () => ({ googleSurfacesCanRun: () => true }));

import {
  GOOGLE_CHECKED_FROM_PLACE,
  INFORMATION_USE,
  SENT_WHEN_A_BUSINESS_IS_ADDED,
} from "@/lib/legal/data-facts";
import { googleAiDataSentence } from "@/lib/marketing/google-ai";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

let policy = "";

beforeAll(async () => {
  const Page = (await import("@/app/(marketing)/privacy/page")).default;
  policy = renderToStaticMarkup(Page())
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}, 60_000);

describe("the live privacy page", () => {
  it("no 'solely': what the information is used for, from data-facts", () => {
    expect(policy).not.toMatch(/solely/i);
    expect(policy).toContain(INFORMATION_USE);
    expect(INFORMATION_USE).toContain("to work out what kind of business each one you add is");
    // The home-page sentence it points back to is on the page too.
    expect(policy).toContain(SENT_WHEN_A_BUSINESS_IS_ADDED);
  });

  it("no data processing agreement it can't show", () => {
    expect(policy).not.toMatch(/data processing agreement/i);
    expect(policy).toContain("Payment processing is handled by Stripe.");
  });

  it("DataForSEO: the questions and the place each is checked from, in the FAQ's words", () => {
    expect(policy).toContain(
      `which collects Google's search results for us, logged out, with ${GOOGLE_CHECKED_FROM_PLACE}.`,
    );
    expect(GOOGLE_CHECKED_FROM_PLACE).toContain(
      "your postcode where Google supports it, otherwise your suburb, city or state capital",
    );
    const faq = googleAiDataSentence({
      surfaces: ["google_ai_overviews", "google_ai_mode"],
      fromTier: "growth",
      fromPlan: "Growth",
      countedInScore: false,
      device: "desktop",
      queueMode: "standard",
    });
    expect(faq).toContain(GOOGLE_CHECKED_FROM_PLACE);
  });
});

describe("the draft for review", () => {
  const draft = readFileSync("docs/privacy-policy-draft.md", "utf8");

  it("says it's a draft, not legal advice, at the top", () => {
    expect(draft.split("\n").slice(0, 4).join(" ")).toContain(
      "Draft, not legal advice; to be reviewed before publishing.",
    );
  });

  it("names every processor, what it receives and its region (or that config doesn't set one)", () => {
    for (const processor of [
      "Neon",
      "Vercel",
      "Supabase Storage",
      "Resend",
      "Inngest",
      "Sentry",
      "PostHog",
      "Upstash",
      "Stripe",
      "OpenAI",
      "Anthropic",
      "Google (Gemini)",
      "Perplexity",
      "DataForSEO",
    ]) {
      expect(draft, processor).toMatch(
        new RegExp(`^\\| ${processor.replace(/[()]/g, "\\$&")}`, "m"),
      );
    }
    expect(draft).toContain("Not set in config");
    expect(draft).toContain('`vercel.json` `"regions": ["syd1"]`');
  });

  it("says how long each kind of data is kept, and what Sentry and PostHog are configured to leave out", () => {
    expect(draft).toContain("12 months after the audit ran");
    expect(draft).toContain("90 days after the visit");
    expect(draft).toContain("Until the workspace asks us to delete them");
    expect(draft).toContain("`sendDefaultPii` isn't set");
    expect(draft).toContain("PostHog starts on page load, before the cookie banner is answered.");
  });

  // A comment may point to it; no shipped code links or reads it.
  readSourcesBeforeAll(["app", "components", "lib"]);
  it("isn't linked from the site", () => {
    const stripComments = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const linking = sourcePaths(["app", "components", "lib"]).filter((path) =>
      stripComments(sourceText(path)).includes("privacy-policy-draft"),
    );
    expect(linking).toEqual([]);
  });
});
