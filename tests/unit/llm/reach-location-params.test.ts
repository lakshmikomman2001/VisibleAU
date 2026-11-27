/**
 * S04 part 1 (LLD 8.4.4; amendment 18): the engines that take a web-search location are exactly those whose
 * implementations send one. ChatGPT and Claude pass `userLocation` (OpenAI's and Anthropic's `user_location`), and from
 * S04B part 1 (LLD amendment 99) Perplexity's Agent API web_search takes `user_location`; Gemini's google_search tool
 * takes none, so it never reads input.location.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENGINE_LOCATION_FIELDS, REACH_LOCATION_FIELDS } from "@/lib/llm/reach-location-params";

/** An implementation's code, its comments left out. */
const impl = (name: string) =>
  readFileSync(`lib/llm/${name}-impl.ts`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

describe("engine location parameters (confirmed 27 Nov 2026)", () => {
  it("ChatGPT, Claude and Perplexity send a location; Gemini never reads it", () => {
    expect(impl("openai")).toMatch(/userLocation: \{ type: "approximate"/);
    expect(impl("anthropic")).toMatch(/userLocation: \{ type: "approximate"/);
    expect(impl("google")).not.toMatch(/input\.location\b/);
    expect(impl("perplexity")).toMatch(/user_location: userLocation/);
    expect(impl("perplexity")).toMatch(/input\.location\b/);
    expect(ENGINE_LOCATION_FIELDS.gemini).toEqual([]);
    expect(ENGINE_LOCATION_FIELDS.perplexity).toEqual(["city", "region", "country"]);
    expect(ENGINE_LOCATION_FIELDS.chatgpt).toEqual(["city", "region", "country"]);
    expect(ENGINE_LOCATION_FIELDS.claude).toEqual(["city", "region", "country"]);
  });

  it("Worldwide sends no location; Country sends the country alone", () => {
    expect(REACH_LOCATION_FIELDS.global).toEqual({ chatgpt: [], claude: [], perplexity: [] });
    expect(REACH_LOCATION_FIELDS.country).toEqual({
      chatgpt: ["country"],
      claude: ["country"],
      perplexity: ["country"],
    });
    expect(REACH_LOCATION_FIELDS.state.perplexity).toEqual(["region", "country"]);
  });
});
