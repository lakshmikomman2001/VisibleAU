/**
 * "Mention detection" (6 Nov), part 5 -- verification means the same thing on every engine: a source the
 * ANSWER cited is the brand's own domain. The real adapters and the real installed AI SDK providers parse
 * canned provider responses (tests/helpers/canned-llm-responses.ts, no network); the runners' own
 * mergeCitedSources and verifyMention then decide, as inngest/functions/run-audit.ts does.
 *
 * diag-0122 (production, Omega #37-#40): Claude's stored sources were every search result (11.7 per answer),
 * and all 40 Gemini answers stored one Google redirect link instead of the sites Gemini used.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractCitations, mergeCitedSources } from "@/lib/audit/extract-citations";
import { verifyMention } from "@/lib/audit/verify-mention";
import type { CompleteOutput } from "@/lib/llm/interface";
import {
  anthropicCitedText,
  anthropicMessage,
  anthropicSearch,
  anthropicText,
  cannedFetch,
  GOOGLE_REDIRECT,
  geminiResponse,
} from "../../helpers/canned-llm-responses";

const { getCachedMock } = vi.hoisted(() => ({ getCachedMock: vi.fn() }));
vi.mock("@/lib/llm/cache", () => ({
  getCached: getCachedMock,
  setCached: vi.fn().mockResolvedValue(undefined),
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

const BRAND = {
  domain: "omegaservices.com.au",
  suburb: "Norwest",
  city: null,
  state: "NSW",
  locationConfirmedAt: new Date("2026-10-01T00:00:00Z"),
  locationMode: "fixed" as const,
};

function storeAndVerify(output: Pick<CompleteOutput, "response" | "citedUrls">) {
  const sources = mergeCitedSources(extractCitations(output.response), output.citedUrls);
  const verification = verifyMention({
    matchIndex: output.response.indexOf("Omega Services"),
    responseText: output.response,
    citedSources: sources,
    brand: BRAND,
  });
  return { sources, verification };
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
  getCachedMock.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function claude(content: Array<Record<string, unknown>>) {
  vi.stubGlobal("fetch", cannedFetch([anthropicMessage(content)]).fetchStub);
  const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
  return new AnthropicImpl().complete({
    engine: "claude",
    prompt: "Good plumber?",
    task: "brand_mention",
    cacheMode: "fresh",
  });
}

async function gemini(text: string, chunks: Array<{ uri: string; title?: string }>) {
  vi.stubGlobal("fetch", cannedFetch([geminiResponse([{ text }], "STOP", chunks)]).fetchStub);
  const { GoogleImpl } = await import("@/lib/llm/google-impl");
  return new GoogleImpl().complete({
    engine: "gemini",
    prompt: "Good plumber?",
    task: "brand_mention",
    cacheMode: "fresh",
  });
}

describe("Claude: only a page the answer cited verifies", () => {
  it("the brand's site only among the search results is stored as seen in search, and doesn't verify", async () => {
    const output = await claude([
      anthropicText("I'll search for local plumbers."),
      ...anthropicSearch("srvtoolu_1", [
        "https://omegaservices.com.au/",
        "https://hipages.com.au/plumbers",
      ]),
      anthropicCitedText("A popular choice is Omega Services.", "https://hipages.com.au/plumbers"),
    ]);
    const { sources, verification } = storeAndVerify(output);

    expect(sources).toEqual([
      { domain: "hipages.com.au", url: "https://hipages.com.au/plumbers", origin: "retrieved" },
      {
        domain: "omegaservices.com.au",
        url: "https://omegaservices.com.au/",
        origin: "retrieved",
        cited: false,
      },
    ]);
    expect(verification).toBe("unverified");
  });

  it("an answer that cites the brand's site verifies by domain", async () => {
    const output = await claude([
      anthropicText("I'll search for local plumbers."),
      ...anthropicSearch("srvtoolu_1", ["https://omegaservices.com.au/"]),
      anthropicCitedText("Omega Services is a popular choice.", "https://omegaservices.com.au/"),
    ]);

    expect(storeAndVerify(output).verification).toBe("verified_domain");
  });
});

describe("Gemini: the sites its grounding titles name are stored and verify", () => {
  it("a grounding title naming the brand's domain verifies; each site is stored with its link", async () => {
    const output = await gemini("A popular choice is Omega Services.", [
      { uri: `${GOOGLE_REDIRECT}a`, title: "omegaservices.com.au" },
      { uri: `${GOOGLE_REDIRECT}b`, title: "hipages.com.au" },
    ]);
    const { sources, verification } = storeAndVerify(output);

    expect(sources).toEqual([
      { domain: "omegaservices.com.au", url: `${GOOGLE_REDIRECT}a`, origin: "retrieved" },
      { domain: "hipages.com.au", url: `${GOOGLE_REDIRECT}b`, origin: "retrieved" },
    ]);
    expect(verification).toBe("verified_domain");
  });

  it("the same answer served from the cache still verifies by domain", async () => {
    getCachedMock.mockResolvedValue({
      response: "A popular choice is Omega Services.",
      tokensUsed: 80,
      costEstimateUsd: 0,
      model: "gemini-2.5-flash",
      citedUrls: [{ url: `${GOOGLE_REDIRECT}a`, domain: "omegaservices.com.au" }],
      isCacheHit: true,
    });
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const output = await new GoogleImpl().complete({
      engine: "gemini",
      prompt: "Good plumber?",
      task: "brand_mention",
      cacheMode: "retry",
    });

    expect(output.isCacheHit).toBe(true);
    expect(storeAndVerify(output).verification).toBe("verified_domain");
  });
});
