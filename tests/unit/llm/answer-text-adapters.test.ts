/**
 * "Mention detection" (6 Nov), part 1 -- the real adapters, fed canned provider responses through the real
 * installed AI SDK (tests/helpers/canned-llm-responses.ts), store the answer with a newline between separate
 * runs of writing, so a brand name that starts the text after a web search is still found.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import {
  anthropicCitedText,
  anthropicMessage,
  anthropicSearch,
  anthropicText,
  cannedFetch,
  GOOGLE_REDIRECT,
  geminiResponse,
} from "../../helpers/canned-llm-responses";

vi.mock("@/lib/llm/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

const BRAND = { name: "Omega Services", domain: "omegaservices.com.au" };

describe("the real adapters store the joined text (canned provider responses, real AI SDK)", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
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

  it("Claude: text before a search ending in a letter, then the brand name: a newline between, and the mention found", async () => {
    const output = await claude([
      anthropicText("I'll search for plumbers near Norwest"),
      ...anthropicSearch("srvtoolu_1", ["https://omegaservices.com.au/"]),
      anthropicCitedText(
        "Omega Services is a well-reviewed plumber",
        "https://omegaservices.com.au/",
      ),
      anthropicText(" based in Norwest."),
    ]);

    expect(output.response).toBe(
      "I'll search for plumbers near Norwest\nOmega Services is a well-reviewed plumber based in Norwest.",
    );
    expect((await detectBrandMention(output.response, BRAND)).found).toBe(true);
  });

  it("Claude: Anthropic's documented web search response no longer reads 'born.Based'", async () => {
    const output = await claude([
      anthropicText("I'll search for when Claude Shannon was born."),
      ...anthropicSearch("srvtoolu_01WYG3ziw53XMcoyKL4XcZmE", [
        "https://en.wikipedia.org/wiki/Claude_Shannon",
      ]),
      anthropicText("Based on the search results, "),
      anthropicCitedText(
        "Claude Shannon was born on April 30, 1916, in Petoskey, Michigan",
        "https://en.wikipedia.org/wiki/Claude_Shannon",
      ),
    ]);

    expect(output.response).toBe(
      "I'll search for when Claude Shannon was born.\nBased on the search results, Claude Shannon was born on April 30, 1916, in Petoskey, Michigan",
    );
  });

  it("Claude: an answer with no search, one block, is stored byte for byte", async () => {
    const only = "Here are three options:\n\n1. **Omega Services** - Norwest\n2. Jim's Plumbing\n";
    const output = await claude([anthropicText(only)]);
    expect(output.response).toBe(only);
  });

  it("Gemini: several text parts of one answer join as written, with the grounding sources after them", async () => {
    vi.stubGlobal(
      "fetch",
      cannedFetch([
        geminiResponse(
          [
            { text: "Here are some plumbers in Norwest:\n\n" },
            { text: "*   **Omega Services** - 24/7 call-outs." },
          ],
          "STOP",
          [{ uri: `${GOOGLE_REDIRECT}a`, title: "hipages.com.au" }],
        ),
      ]).fetchStub,
    );
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const output = await new GoogleImpl().complete({
      engine: "gemini",
      prompt: "Good plumber?",
      task: "brand_mention",
      cacheMode: "fresh",
    });

    expect(output.response).toBe(
      "Here are some plumbers in Norwest:\n\n*   **Omega Services** - 24/7 call-outs.",
    );
  });
});
