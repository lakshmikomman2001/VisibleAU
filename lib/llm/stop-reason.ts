/**
 * "Mention detection" (6 Nov), part 2 -- why a provider stopped writing, and what that means for the answer.
 *
 * The AI SDK reports `finishReason` (its own word) and `rawFinishReason` (the provider's):
 *  - Claude: end_turn, max_tokens, pause_turn, refusal... @ai-sdk/anthropic maps pause_turn to "stop"
 *    (mapAnthropicStopReason), so only the raw value shows a paused turn.
 *  - Gemini: STOP, MAX_TOKENS, and RECITATION / SAFETY / BLOCKLIST / PROHIBITED_CONTENT / SPII /
 *    IMAGE_SAFETY, all mapped to "content-filter" (mapGoogleGenerativeAIFinishReason).
 *  - OpenAI (Responses API): incomplete_details.reason -- max_output_tokens ("length"), content_filter
 *    ("content-filter"); nothing at all when the answer finished ("stop").
 * Before part 2 no adapter read either, so a paused or filtered answer was stored and scored as complete.
 */
export type StopOutcome = "complete" | "truncated" | "paused" | "filtered";

export function stopOutcome(finishReason: unknown, rawFinishReason: unknown): StopOutcome {
  if (rawFinishReason === "pause_turn") return "paused";
  if (finishReason === "content-filter") return "filtered";
  if (finishReason === "length") return "truncated";
  return "complete";
}

/** What citations.stop_reason stores: the provider's own word when it gave one, else the SDK's. */
export function storedStopReason(
  finishReason: unknown,
  rawFinishReason: unknown,
): string | undefined {
  const reason =
    typeof rawFinishReason === "string" && rawFinishReason.length > 0
      ? rawFinishReason
      : typeof finishReason === "string" && finishReason.length > 0
        ? finishReason
        : undefined;
  return reason?.slice(0, 64);
}

/**
 * A failure's message when a provider's own filter stopped the answer. lib/llm/failure-patterns.ts's
 * providerFilter pattern reads it; the reason shown is "Provider stopped the answer (safety or recitation
 * filter)" (lib/audit/engine-failure.ts).
 */
export function providerFilterMessage(stopReason: string | undefined): string {
  return `Provider stopped the answer (safety or recitation filter): ${stopReason ?? "content-filter"}`;
}

/** How many times a paused Claude turn is sent back to carry on before the answer counts as incomplete. */
export const MAX_PAUSE_TURN_CONTINUATIONS = 3;

/** A failure's message when Claude's turn was still paused after the continuations (failure-patterns' answerIncomplete). */
export function pausedAnswerMessage(requests: number): string {
  return `Answer incomplete: Claude paused its answer (pause_turn) and hadn't finished after ${requests} requests`;
}

/** A failure's message when sending the paused turn back failed; the provider's own reason follows. */
export function continuationFailedMessage(cause: string): string {
  return `Answer incomplete: Claude paused its answer (pause_turn), and continuing it failed: ${cause}`;
}
