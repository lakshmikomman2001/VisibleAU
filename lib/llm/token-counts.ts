/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 7 -- a call's input and output tokens, exactly as its provider
 * reported them (citations.llm_input_tokens / llm_output_tokens), so an answer's length is measured, not
 * estimated from its characters (diag-0121). Undefined -- stored NULL -- when the provider reported no figure;
 * never filled in from the total or a guess.
 */
export interface TokenCounts {
  inputTokens?: number;
  outputTokens?: number;
}

/** A token count a provider reported: a finite, non-negative number; anything else is no figure. */
export function reportedTokens(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * The input and output tokens in an AI SDK usage object (ai@6: inputTokens / outputTokens, each undefined when
 * the provider gave none; promptTokens / completionTokens on the older shape the adapters also read).
 */
export function usageTokens(usage: unknown): TokenCounts {
  if (typeof usage !== "object" || usage === null) return {};
  const u = usage as Record<string, unknown>;
  const inputTokens = reportedTokens(u.inputTokens) ?? reportedTokens(u.promptTokens);
  const outputTokens = reportedTokens(u.outputTokens) ?? reportedTokens(u.completionTokens);
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
  };
}

/** Several requests that make one answer (a paused Claude turn carried on): each side's sum, when every request
 * reported it; otherwise that side is unknown. */
export function sumTokenCounts(counts: readonly TokenCounts[]): TokenCounts {
  const sum = (side: keyof TokenCounts) =>
    counts.length > 0 && counts.every((c) => c[side] !== undefined)
      ? counts.reduce((total, c) => total + (c[side] ?? 0), 0)
      : undefined;
  const inputTokens = sum("inputTokens");
  const outputTokens = sum("outputTokens");
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
  };
}
