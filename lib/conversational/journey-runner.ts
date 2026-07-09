import { getLLMService } from "@/lib/llm";
import { selectModel } from "@/lib/llm/model-selector";
import type { Engine } from "@/lib/llm/interface";
import type { JourneyTurn, TurnResult } from "./types";

interface RunTurnInput {
  turn: JourneyTurn;
  brandName: string;
  engine: Engine;
  tier: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
}

export async function runJourneyTurn(input: RunTurnInput): Promise<{
  turnResult: TurnResult;
  assistantResponse: string;
}> {
  const { turn, brandName, engine, tier, conversationHistory } = input;

  const resolvedPrompt = turn.prompt.replace(/\{brandName\}/g, brandName);

  const contextPrefix = conversationHistory.length > 0
    ? conversationHistory
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n") + "\n\n"
    : "";

  const fullPrompt = contextPrefix + `User: ${resolvedPrompt}`;

  const model = selectModel(tier as "free" | "starter" | "growth" | "agency" | "agency_pro" | "enterprise", engine, "brand_mention");
  const llm = getLLMService(engine);
  const output = await llm.complete({
    engine,
    prompt: fullPrompt,
    task: "brand_mention",
    model,
  });

  const response = output.response;
  const brandLower = brandName.toLowerCase();
  const responseLower = response.toLowerCase();
  const brandMentioned = responseLower.includes(brandLower);

  let position: number | null = null;
  if (brandMentioned) {
    const idx = responseLower.indexOf(brandLower);
    const textBefore = response.slice(0, idx);
    const numberedItems = textBefore.match(/^\d+[\.\)]/gm);
    position = numberedItems ? numberedItems.length + 1 : 1;
  }

  const contextLabel = brandMentioned
    ? (position === 1 ? "top_recommendation" : "mentioned")
    : "not_mentioned";

  const competitorsMentioned: string[] = [];

  const turnResult: TurnResult = {
    turn: turn.turn,
    prompt: resolvedPrompt,
    brand_mentioned: brandMentioned,
    position,
    context_label: contextLabel,
    competitors_mentioned: competitorsMentioned,
  };

  return { turnResult, assistantResponse: response };
}
