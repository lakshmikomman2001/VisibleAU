import { SCORE_BASIS } from "../events";

export function formatSheets(eventName: string, payload: Record<string, unknown>) {
  return {
    event: eventName,
    brand: String(payload.brandName ?? ""),
    score: payload.scoreComposite ?? payload.currentScore ?? "",
    // Vunnara (19 Oct): "score" is now the mention rate, not the old
    // weighted blend -- a new column so sheets can tell rows apart.
    score_basis: SCORE_BASIS,
    delta: payload.delta ?? payload.scoreDelta ?? "",
    timestamp: new Date().toISOString(),
    url: String(payload.url ?? ""),
  };
}
