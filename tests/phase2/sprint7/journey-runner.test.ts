import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({
  getLLMService: vi.fn(() => ({
    complete: vi.fn(async ({ prompt }: { prompt: string }) => ({
      response: prompt.includes("VisibleAU")
        ? "I recommend VisibleAU for your needs."
        : "Here are some options to consider.",
    })),
  })),
}));

vi.mock("@/lib/llm/model-selector", () => ({
  selectModel: vi.fn(() => "mock-model"),
}));

import { runJourneyTurn } from "@/lib/conversational/journey-runner";
import { getLLMService } from "@/lib/llm";
import type { JourneyTurn } from "@/lib/conversational/types";

describe("journey-runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getLLMService as ReturnType<typeof vi.fn>).mockReturnValue({
      complete: vi.fn(async ({ prompt }: { prompt: string }) => ({
        response: prompt.includes("VisibleAU")
          ? "I recommend VisibleAU for your needs."
          : "Here are some options to consider.",
      })),
    });
  });

  it("substitutes {brandName} in prompts", async () => {
    const turn: JourneyTurn = { turn: 1, prompt: "Who provides {brandName} services?", intent: "awareness" };
    const result = await runJourneyTurn({
      turn,
      brandName: "VisibleAU",
      engine: "chatgpt",
      tier: "growth",
      conversationHistory: [],
    });

    expect(result.turnResult.prompt).toBe("Who provides VisibleAU services?");
    expect(result.turnResult.prompt).not.toContain("{brandName}");
  });

  it("carries conversation context across turns", async () => {
    const { getLLMService } = await import("@/lib/llm");
    const mockComplete = vi.fn(async () => ({ response: "VisibleAU is great." }));
    (getLLMService as ReturnType<typeof vi.fn>).mockReturnValue({ complete: mockComplete });

    const turn2: JourneyTurn = { turn: 2, prompt: "Tell me more", intent: "followup" };
    await runJourneyTurn({
      turn: turn2,
      brandName: "VisibleAU",
      engine: "chatgpt",
      tier: "growth",
      conversationHistory: [
        { role: "user", content: "Who does SEO?" },
        { role: "assistant", content: "Several providers exist." },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calledWith = (mockComplete.mock.calls as any[][])[0]?.[0];
    expect(calledWith.prompt).toContain("Who does SEO?");
    expect(calledWith.prompt).toContain("Several providers exist.");
  });

  it("returns brand_mentioned false when brand absent from response", async () => {
    const { getLLMService } = await import("@/lib/llm");
    (getLLMService as ReturnType<typeof vi.fn>).mockReturnValue({
      complete: vi.fn(async () => ({
        response: "There are several SEO providers in Sydney you might consider.",
      })),
    });

    const turn: JourneyTurn = { turn: 1, prompt: "Who does SEO in Sydney?", intent: "awareness" };
    const result = await runJourneyTurn({
      turn,
      brandName: "VisibleAU",
      engine: "chatgpt",
      tier: "growth",
      conversationHistory: [],
    });

    expect(result.turnResult.brand_mentioned).toBe(false);
    expect(result.turnResult.position).toBeNull();
    expect(result.turnResult.context_label).toBe("not_mentioned");
  });

  it("returns proper TurnResult shape", async () => {
    const turn: JourneyTurn = { turn: 1, prompt: "Test {brandName}", intent: "awareness" };
    const result = await runJourneyTurn({
      turn,
      brandName: "VisibleAU",
      engine: "chatgpt",
      tier: "growth",
      conversationHistory: [],
    });

    expect(result.turnResult).toMatchObject({
      turn: 1,
      prompt: expect.any(String),
      brand_mentioned: expect.any(Boolean),
      position: expect.anything(),
      context_label: expect.any(String),
      competitors_mentioned: expect.any(Array),
    });
    expect(result).toHaveProperty("assistantResponse");
  });
});
