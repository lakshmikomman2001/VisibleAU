/**
 * "Mention detection" (6 Nov), part 2 -- the AI SDK's finish reason (its own word) and raw finish reason
 * (the provider's) decide what a response is. pause_turn shows only in the raw value: @ai-sdk/anthropic
 * reports it as an ordinary "stop".
 */
import { describe, expect, it } from "vitest";
import { stopOutcome, storedStopReason } from "@/lib/llm/stop-reason";

describe("stopOutcome", () => {
  it.each([
    ["stop", "pause_turn", "paused"],
    ["content-filter", "RECITATION", "filtered"],
    ["content-filter", "SAFETY", "filtered"],
    ["content-filter", "content_filter", "filtered"],
    ["content-filter", "refusal", "filtered"],
    ["length", "max_tokens", "truncated"],
    ["length", "MAX_TOKENS", "truncated"],
    ["length", "max_output_tokens", "truncated"],
    ["stop", "end_turn", "complete"],
    ["stop", "STOP", "complete"],
    ["stop", undefined, "complete"],
    [undefined, undefined, "complete"],
  ])("finishReason %s, raw %s: %s", (finishReason, raw, outcome) => {
    expect(stopOutcome(finishReason, raw)).toBe(outcome);
  });
});

describe("storedStopReason", () => {
  it("is the provider's own word when it gave one, else the SDK's, else nothing", () => {
    expect(storedStopReason("stop", "end_turn")).toBe("end_turn");
    expect(storedStopReason("stop", undefined)).toBe("stop");
    expect(storedStopReason(undefined, undefined)).toBeUndefined();
  });

  it("is never longer than 64 characters", () => {
    expect(storedStopReason("stop", "x".repeat(200))).toHaveLength(64);
  });
});
