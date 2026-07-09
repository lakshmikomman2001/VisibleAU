import type { JourneyScoreOutput, TurnResult } from "./types";

export function scoreJourney(turnResults: TurnResult[]): JourneyScoreOutput {
  const totalTurns = turnResults.length;
  const mentionedTurns = turnResults.filter((t) => t.brand_mentioned);
  const brandAppearedInNTurns = mentionedTurns.length;

  let firstMentionTurn: number | null = null;
  for (const t of turnResults) {
    if (t.brand_mentioned) {
      firstMentionTurn = t.turn;
      break;
    }
  }

  const baseScore = (brandAppearedInNTurns / totalTurns) * 100;

  let earlyMentionBonus = 0;
  if (firstMentionTurn === 1) earlyMentionBonus = 10;
  else if (firstMentionTurn === 2) earlyMentionBonus = 5;

  const journeyScore = Math.min(100, baseScore + earlyMentionBonus);

  return {
    brandAppearedInNTurns,
    totalTurns,
    journeyScore: Math.round(journeyScore * 100) / 100,
    firstMentionTurn,
  };
}
