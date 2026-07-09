import { describe, it, expect } from "vitest";
import { scoreJourney } from "@/lib/conversational/journey-scorer";
import type { TurnResult } from "@/lib/conversational/types";

function makeTurn(turn: number, brandMentioned: boolean): TurnResult {
  return {
    turn,
    prompt: `prompt-${turn}`,
    brand_mentioned: brandMentioned,
    position: brandMentioned ? 1 : null,
    context_label: brandMentioned ? "mentioned" : "not_mentioned",
    competitors_mentioned: [],
  };
}

describe("scoreJourney", () => {
  it("3 of 5 turns, first mention at turn 1 → 70.0", () => {
    const turns = [
      makeTurn(1, true),
      makeTurn(2, false),
      makeTurn(3, true),
      makeTurn(4, false),
      makeTurn(5, true),
    ];
    const result = scoreJourney(turns);
    expect(result.brandAppearedInNTurns).toBe(3);
    expect(result.totalTurns).toBe(5);
    expect(result.journeyScore).toBe(70);
    expect(result.firstMentionTurn).toBe(1);
  });

  it("applies +10 early mention bonus for turn 1", () => {
    const turns = [makeTurn(1, true), makeTurn(2, false)];
    const result = scoreJourney(turns);
    // base = 50, bonus = 10 → 60
    expect(result.journeyScore).toBe(60);
  });

  it("applies +5 early mention bonus for turn 2", () => {
    const turns = [makeTurn(1, false), makeTurn(2, true)];
    const result = scoreJourney(turns);
    // base = 50, bonus = 5 → 55
    expect(result.journeyScore).toBe(55);
    expect(result.firstMentionTurn).toBe(2);
  });

  it("gives no bonus for first mention at turn 3+", () => {
    const turns = [makeTurn(1, false), makeTurn(2, false), makeTurn(3, true)];
    const result = scoreJourney(turns);
    // base = (1/3)*100 = 33.33, bonus = 0
    expect(result.journeyScore).toBeCloseTo(33.33, 1);
    expect(result.firstMentionTurn).toBe(3);
  });

  it("caps at 100 even with early bonus", () => {
    const turns = [makeTurn(1, true), makeTurn(2, true)];
    const result = scoreJourney(turns);
    // base = 100, bonus = 10 → capped at 100
    expect(result.journeyScore).toBe(100);
  });

  it("scores 0 when brand never mentioned", () => {
    const turns = [makeTurn(1, false), makeTurn(2, false), makeTurn(3, false)];
    const result = scoreJourney(turns);
    expect(result.journeyScore).toBe(0);
    expect(result.brandAppearedInNTurns).toBe(0);
    expect(result.firstMentionTurn).toBeNull();
  });
});
