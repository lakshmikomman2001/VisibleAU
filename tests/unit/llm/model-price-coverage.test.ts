/**
 * "Cost honesty" (25 Oct), item 2 -- every model the app can call has a price-table entry, so a
 * model that ships without one fails here instead of being counted as "Cost incomplete" in production.
 */
import { describe, expect, it } from "vitest";
import { tierEnum } from "@/db/schema/enums";
import { isPricedModel } from "@/lib/audit/compute-cost";
import type { ModelTask } from "@/lib/llm/interface";
import { ENGINE_DEFAULT_MODELS, selectModel } from "@/lib/llm/model-selector";
import { enginesForTier } from "@/lib/llm/tier-engines";

// A Record, so adding a ModelTask without listing it here fails to compile.
const TASKS: Record<ModelTask, true> = {
  brand_mention: true,
  sentiment: true,
  context: true,
  content_draft: true,
  narrative_generation: true,
};

function callableModels(): Map<string, string> {
  const models = new Map<string, string>();
  for (const tier of tierEnum.enumValues) {
    for (const engine of enginesForTier(tier)) {
      for (const task of Object.keys(TASKS) as ModelTask[]) {
        const model = selectModel(tier, engine, task);
        if (!models.has(model)) models.set(model, `selectModel(${tier}, ${engine}, ${task})`);
      }
    }
  }
  for (const [engine, model] of Object.entries(ENGINE_DEFAULT_MODELS)) {
    if (!models.has(model)) models.set(model, `${engine} client default`);
  }
  return models;
}

describe("model price coverage", () => {
  it("every model enginesForTier/selectModel or an engine client can call has a price entry", () => {
    const unpriced = [...callableModels()]
      .filter(([model]) => !isPricedModel(model))
      .map(([model, from]) => `${model} (from ${from})`);
    expect(unpriced).toEqual([]);
  });

  it("finds the models it is meant to cover", () => {
    expect([...callableModels().keys()].sort()).toEqual([
      "claude-haiku-4-5",
      "claude-sonnet-4-6",
      "gemini-2.5-flash",
      "gpt-4.1",
      "gpt-4.1-mini",
      "sonar",
      "sonar-pro",
    ]);
  });
});
