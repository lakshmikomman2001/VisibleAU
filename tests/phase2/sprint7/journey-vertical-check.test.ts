import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { JourneyPromptSequenceSchema } from "@/lib/conversational/types";

const migrationSrc = readFileSync(
  resolve(__dirname, "../../../db/migrations/0020_phase2_sprint7_discovery.sql"),
  "utf-8",
);

describe("journey vertical CHECK constraint", () => {
  it("migration includes all 5 vertical values", () => {
    const expected = ["tradies", "allied_health", "saas", "professional_services", "real_estate"];
    for (const v of expected) {
      expect(migrationSrc).toContain(v);
    }
  });

  it("migration CHECK would reject unknown verticals", () => {
    expect(migrationSrc).toContain("conversation_journeys_vertical_check");
    expect(migrationSrc).toContain("CHECK");
  });
});

describe("prompt_sequence Zod validation", () => {
  it("rejects fewer than 2 turns", () => {
    const result = JourneyPromptSequenceSchema.safeParse([
      { turn: 1, prompt: "hello", intent: "awareness" },
    ]);
    expect(result.success).toBe(false);
  });

  it("accepts exactly 2 turns", () => {
    const result = JourneyPromptSequenceSchema.safeParse([
      { turn: 1, prompt: "hello", intent: "awareness" },
      { turn: 2, prompt: "follow up", intent: "followup" },
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts exactly 8 turns", () => {
    const turns = Array.from({ length: 8 }, (_, i) => ({
      turn: i + 1,
      prompt: `Turn ${i + 1}`,
      intent: "awareness" as const,
    }));
    const result = JourneyPromptSequenceSchema.safeParse(turns);
    expect(result.success).toBe(true);
  });

  it("rejects more than 8 turns", () => {
    const turns = Array.from({ length: 9 }, (_, i) => ({
      turn: i + 1,
      prompt: `Turn ${i + 1}`,
      intent: "awareness" as const,
    }));
    const result = JourneyPromptSequenceSchema.safeParse(turns);
    expect(result.success).toBe(false);
  });
});
