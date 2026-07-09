import { z } from "zod";

export interface JourneyTurn {
  turn: number;
  prompt: string;
  intent: "awareness" | "followup" | "compare" | "decide";
}

export const JourneyTurnSchema = z.object({
  turn: z.number().int().min(1),
  prompt: z.string().min(1),
  intent: z.enum(["awareness", "followup", "compare", "decide"]),
});

export const JourneyPromptSequenceSchema = z
  .array(JourneyTurnSchema)
  .min(2)
  .max(8);

export interface TurnResult {
  turn: number;
  prompt: string;
  brand_mentioned: boolean;
  position: number | null;
  context_label: string;
  competitors_mentioned: string[];
}

export interface JourneyScoreOutput {
  brandAppearedInNTurns: number;
  totalTurns: number;
  journeyScore: number;
  firstMentionTurn: number | null;
}
