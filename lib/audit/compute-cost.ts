import type { Engine } from "@/lib/llm/interface";

const PRICING_PER_1K: Record<string, { engine: Engine; input: number; output: number }> = {
  "gpt-4o-mini": { engine: "chatgpt", input: 0.00015, output: 0.0006 },
  "gpt-4o": { engine: "chatgpt", input: 0.0025, output: 0.01 },
  "gpt-4.1-mini": { engine: "chatgpt", input: 0.0004, output: 0.0016 },
  "gpt-4.1": { engine: "chatgpt", input: 0.002, output: 0.008 },
  "claude-3-5-haiku-20241022": { engine: "claude", input: 0.00025, output: 0.00125 },
  "claude-3-5-sonnet-20241022": { engine: "claude", input: 0.003, output: 0.015 },
  "claude-haiku-4-5": { engine: "claude", input: 0.00025, output: 0.00125 },
  "claude-sonnet-4-6": { engine: "claude", input: 0.003, output: 0.015 },
  "gemini-1.5-flash": { engine: "gemini", input: 0.000075, output: 0.0003 },
  "gemini-1.5-pro": { engine: "gemini", input: 0.00125, output: 0.005 },
  "gemini-2.0-flash": { engine: "gemini", input: 0.0001, output: 0.0004 },
  "gemini-2.5-flash": { engine: "gemini", input: 0.00015, output: 0.0006 },
  "gemini-2.5-pro": { engine: "gemini", input: 0.00125, output: 0.005 },
  sonar: { engine: "perplexity", input: 0.001, output: 0.001 },
  "sonar-pro": { engine: "perplexity", input: 0.003, output: 0.015 },
};

export function isPricedModel(model: string): boolean {
  return Object.hasOwn(PRICING_PER_1K, model);
}

/** Token cost from the price table, or null -- never a guessed 0 -- when the model isn't in it. */
export function computeCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const pricing = isPricedModel(model) ? PRICING_PER_1K[model] : undefined;
  if (!pricing) {
    console.error("[cost_price_missing]", JSON.stringify({ event: "cost_price_missing", model }));
    return null;
  }
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

/** One provider call's cost. `usd` is null when its model has no price; `capReserveUsd` is then the
 * same tokens at the engine's highest listed rates -- counted by the daily spend cap only, never shown. */
export interface CallCost {
  usd: number | null;
  capReserveUsd: number;
}

/** A running total over calls: the priced part, whether any call had no price, and the cap-only reserve. */
export interface CostTally {
  knownUsd: number;
  unpriced: boolean;
  capReserveUsd: number;
}

export const EMPTY_COST_TALLY: CostTally = { knownUsd: 0, unpriced: false, capReserveUsd: 0 };

export function addCost(tally: CostTally, usd: number | null, capReserveUsd = 0): CostTally {
  return {
    knownUsd: tally.knownUsd + (usd ?? 0),
    unpriced: tally.unpriced || usd === null,
    capReserveUsd: tally.capReserveUsd + capReserveUsd,
  };
}

/** The cap-only reserve to record, or undefined when every call was priced. */
export function unpricedReserve(tally: CostTally): number | undefined {
  return tally.unpriced ? tally.capReserveUsd : undefined;
}

export function callCost(
  engine: Engine,
  model: string,
  inputTokens: number,
  outputTokens: number,
  feeUsd = 0,
): CallCost {
  const tokensUsd = computeCostUsd(model, inputTokens, outputTokens);
  if (tokensUsd !== null) return { usd: tokensUsd + feeUsd, capReserveUsd: 0 };
  const rates = Object.values(PRICING_PER_1K).filter((p) => p.engine === engine);
  const candidates = rates.length > 0 ? rates : Object.values(PRICING_PER_1K);
  const input = Math.max(...candidates.map((p) => p.input));
  const output = Math.max(...candidates.map((p) => p.output));
  return {
    usd: null,
    capReserveUsd: (inputTokens / 1000) * input + (outputTokens / 1000) * output + feeUsd,
  };
}
