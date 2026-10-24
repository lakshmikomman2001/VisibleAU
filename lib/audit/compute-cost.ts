import type { Engine } from "@/lib/llm/interface";

/**
 * One model's price. Token rates are USD per 1,000 tokens (the official
 * pages quote per 1,000,000 -- divide by 1,000).
 */
export interface ModelPrice {
  engine: Engine;
  input: number;
  output: number;
  /**
   * USD charged per billed request on top of tokens, counted once per
   * billed attempt (callWithRetry adds a billed retry's cost). 0 means the
   * provider charges none -- the web-search fee for a grounded ChatGPT,
   * Claude or Gemini call is separate, in web-search-config.ts's
   * SEARCH_FEE_USD. null means not known yet and not added: it adds
   * nothing and is never "Cost incomplete" (that is only for a model
   * missing from this table).
   */
  requestFeeUsd: number | null;
}

/**
 * Rows the app can call (model-price-coverage.test.ts lists them) carry
 * the official page and the date checked. The others are kept for
 * history and were not re-checked.
 */
const PRICING_PER_1K: Record<string, ModelPrice> = {
  "gpt-4o-mini": { engine: "chatgpt", input: 0.00015, output: 0.0006, requestFeeUsd: 0 },
  "gpt-4o": { engine: "chatgpt", input: 0.0025, output: 0.01, requestFeeUsd: 0 },
  // $0.40 / $1.60 per 1M -- https://developers.openai.com/api/docs/pricing, checked 25 Oct 2026.
  "gpt-4.1-mini": { engine: "chatgpt", input: 0.0004, output: 0.0016, requestFeeUsd: 0 },
  // $2.00 / $8.00 per 1M -- https://developers.openai.com/api/docs/pricing, checked 25 Oct 2026.
  "gpt-4.1": { engine: "chatgpt", input: 0.002, output: 0.008, requestFeeUsd: 0 },
  // $0.80 / $4 per 1M (retired) -- https://platform.claude.com/docs/en/about-claude/pricing, checked 25 Oct 2026.
  "claude-3-5-haiku-20241022": { engine: "claude", input: 0.0008, output: 0.004, requestFeeUsd: 0 },
  "claude-3-5-sonnet-20241022": { engine: "claude", input: 0.003, output: 0.015, requestFeeUsd: 0 },
  // $1 / $5 per 1M -- https://platform.claude.com/docs/en/about-claude/pricing, checked 25 Oct 2026 (was $0.25 / $1.25).
  "claude-haiku-4-5": { engine: "claude", input: 0.001, output: 0.005, requestFeeUsd: 0 },
  // $3 / $15 per 1M -- https://platform.claude.com/docs/en/about-claude/pricing, checked 25 Oct 2026.
  "claude-sonnet-4-6": { engine: "claude", input: 0.003, output: 0.015, requestFeeUsd: 0 },
  "gemini-1.5-flash": { engine: "gemini", input: 0.000075, output: 0.0003, requestFeeUsd: 0 },
  "gemini-1.5-pro": { engine: "gemini", input: 0.00125, output: 0.005, requestFeeUsd: 0 },
  "gemini-2.0-flash": { engine: "gemini", input: 0.0001, output: 0.0004, requestFeeUsd: 0 },
  // $0.30 (text / image / video) / $2.50 (incl. thinking) per 1M, paid tier --
  // https://ai.google.dev/gemini-api/docs/pricing, checked 25 Oct 2026 (was $0.15 / $0.60).
  "gemini-2.5-flash": { engine: "gemini", input: 0.0003, output: 0.0025, requestFeeUsd: 0 },
  "gemini-2.5-pro": { engine: "gemini", input: 0.00125, output: 0.005, requestFeeUsd: 0 },
  // Perplexity: token rates as first entered, not re-verified -- Perplexity's
  // docs no longer list Sonar prices (Sonar Chat Completions ended 27 Sep
  // 2026; requests are reformulated as Agent API requests, which list
  // different rates). TODO(diag-0101-perplexity-cost-by-day.sql): compare
  // what that diag shows with Perplexity's billing, then set requestFeeUsd
  // (and correct these token rates) from the bill.
  sonar: { engine: "perplexity", input: 0.001, output: 0.001, requestFeeUsd: null },
  "sonar-pro": { engine: "perplexity", input: 0.003, output: 0.015, requestFeeUsd: null },
};

export function isPricedModel(model: string): boolean {
  return Object.hasOwn(PRICING_PER_1K, model);
}

/** The price-table row for a model, or undefined when it has none. */
export function modelPrice(model: string): ModelPrice | undefined {
  return isPricedModel(model) ? PRICING_PER_1K[model] : undefined;
}

/** One billed request at this price: tokens plus the request fee (none when null). */
export function priceCall(price: ModelPrice, inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1000) * price.input +
    (outputTokens / 1000) * price.output +
    (price.requestFeeUsd ?? 0)
  );
}

/** Cost from the price table (tokens plus any request fee), or null -- never a guessed 0 -- when
 * the model isn't in it. */
export function computeCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const price = modelPrice(model);
  if (!price) {
    console.error("[cost_price_missing]", JSON.stringify({ event: "cost_price_missing", model }));
    return null;
  }
  return priceCall(price, inputTokens, outputTokens);
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
  const requestFee = Math.max(...candidates.map((p) => p.requestFeeUsd ?? 0));
  return {
    usd: null,
    capReserveUsd:
      (inputTokens / 1000) * input + (outputTokens / 1000) * output + requestFee + feeUsd,
  };
}
