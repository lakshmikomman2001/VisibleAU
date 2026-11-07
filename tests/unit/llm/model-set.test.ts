/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 3 -- an audit's model set (engine -> the models the app asked
 * for, from its answers) decides what it's compared with, and names a change: lib/llm/model-set.ts.
 */
import { describe, expect, it } from "vitest";
import {
  modelSetChangeNote,
  modelSetDifference,
  modelSetKey,
  modelSetOf,
  sameModelSet,
} from "@/lib/llm/model-set";

const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"];
const STARTER = {
  chatgpt: ["gpt-4.1-mini"],
  claude: ["claude-haiku-4-5"],
  gemini: ["gemini-3.5-flash-lite"],
  perplexity: ["sonar"],
};
const GROWTH = { ...STARTER, claude: ["claude-sonnet-4-6"] };

describe("an audit's model set", () => {
  it("each engine's models from its answers, sorted; a row with no model adds its engine with none", () => {
    const set = modelSetOf([
      { engine: "perplexity", llmModel: "sonar-pro" },
      { engine: "perplexity", llmModel: "sonar" },
      { engine: "perplexity", llmModel: "sonar-pro" },
      { engine: "claude", llmModel: "claude-haiku-4-5" },
      { engine: "gemini", llmModel: null },
    ]);
    expect(set).toEqual({
      claude: ["claude-haiku-4-5"],
      gemini: [],
      perplexity: ["sonar", "sonar-pro"],
    });
    expect(modelSetKey(set)).toBe("claude=claude-haiku-4-5;gemini=;perplexity=sonar,sonar-pro");
  });

  it("the same engines with the same models are the same set, in any order; unknown never is", () => {
    expect(sameModelSet(STARTER, { ...STARTER })).toBe(true);
    expect(sameModelSet(STARTER, GROWTH)).toBe(false);
    expect(sameModelSet(STARTER, { chatgpt: ["gpt-4.1-mini"], perplexity: ["sonar"] })).toBe(false);
    expect(sameModelSet(STARTER, undefined)).toBe(false);
    expect(sameModelSet(undefined, undefined)).toBe(false);
  });
});

describe("naming a change", () => {
  it("Starter -> Growth: Claude Haiku 4.5 -> Sonnet 4.6", () => {
    expect(
      modelSetChangeNote(
        { models: STARTER, engines: ENGINES },
        { models: GROWTH, engines: ENGINES },
      ),
    ).toBe("Models changed: Claude Haiku 4.5 → Sonnet 4.6");
  });

  it("Gemini 2.5 Flash -> 3.5 Flash-Lite", () => {
    const before = { ...STARTER, gemini: ["gemini-2.5-flash"] };
    expect(
      modelSetChangeNote(
        { models: before, engines: ENGINES },
        { models: STARTER, engines: ENGINES },
      ),
    ).toBe("Models changed: Gemini 2.5 Flash → 3.5 Flash-Lite");
  });

  it("Free's two engines -> Starter's four: engines added, with their models", () => {
    const free = { chatgpt: ["gpt-4.1-mini"], perplexity: ["sonar"] };
    expect(
      modelSetChangeNote(
        { models: free, engines: ["chatgpt", "perplexity"] },
        { models: STARTER, engines: ENGINES },
      ),
    ).toBe("Models changed: Claude added (Haiku 4.5); Gemini added (3.5 Flash-Lite)");
  });

  it("an engine that failed on one side is no model change", () => {
    const { claude: _failed, ...withoutClaude } = GROWTH;
    expect(
      modelSetChangeNote(
        { models: STARTER, engines: ENGINES },
        { models: withoutClaude, engines: ENGINES },
      ),
    ).toBeNull();
  });

  it("how an audit differs from the one a report compares against", () => {
    expect(
      modelSetDifference(
        { models: STARTER, engines: ENGINES },
        { models: GROWTH, engines: ENGINES },
      ),
    ).toBe("Claude Haiku 4.5, not Sonnet 4.6");
    expect(
      modelSetDifference(
        {
          models: { chatgpt: ["gpt-4.1-mini"], perplexity: ["sonar"] },
          engines: ["chatgpt", "perplexity"],
        },
        { models: STARTER, engines: ENGINES },
      ),
    ).toBe("no Claude; no Gemini");
    expect(
      modelSetDifference(
        { models: GROWTH, engines: ENGINES },
        { models: GROWTH, engines: ENGINES },
      ),
    ).toBeNull();
  });
});
