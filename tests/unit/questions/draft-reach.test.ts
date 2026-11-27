/**
 * S04 part 6 (LLD 8.4.1): the Questions tab's edit-mode draft keeps each question's reach -- a set with NSW and
 * Australia questions (applied from the reach card's draft) opens in edit mode with them in their reaches, so applying
 * it again doesn't turn them into Local questions. A suggestion carries its reach only beyond Local.
 */
import { describe, expect, it } from "vitest";
import { initialDraft } from "@/components/domain/questions/question-editor";
import type { QuestionsResponse } from "@/components/domain/questions/questions-tab";

function question(i: number, reach: "local" | "state" | "country") {
  return {
    id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`,
    position: i,
    text: `Who is the best plumber, question ${i}?`,
    kind: "everyday" as const,
    reach,
    source: "original" as const,
    serviceLabel: null,
    intent: null,
    lastResult: null,
  };
}

describe("the edit-mode draft and reaches", () => {
  it("keeps each question's reach", () => {
    const view = {
      set: {
        id: "set-2",
        version: 2,
        appliedAt: "2026-11-27T01:00:00.000Z",
        appliedBy: null,
        original: false,
        comparingSinceAudit: null,
      },
      questions: [question(0, "local"), question(1, "state"), question(2, "country")],
    } as unknown as QuestionsResponse;
    expect(initialDraft(view).items.map((i) => i.reach)).toEqual(["local", "state", "country"]);
  });
});
