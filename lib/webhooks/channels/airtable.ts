import { SCORE_BASIS } from "../events";

export function formatAirtable(eventName: string, payload: Record<string, unknown>) {
  // scoreComposite is null when the audit had zero successful organic
  // answers (not enough data) -- send an empty cell, never a fabricated 0.
  const rawScore = payload.scoreComposite ?? payload.currentScore;
  return {
    fields: {
      Event: eventName,
      Brand: String(payload.brandName ?? ""),
      Score: rawScore == null ? null : Number(rawScore),
      // Vunnara (19 Oct): "Score" is now the mention rate, not the old
      // weighted blend. NOTE: if this endpoint is ever pointed straight
      // at Airtable's REST create-record API (rather than an automation
      // webhook / Zapier / Make, which accept any JSON), the table needs
      // a `score_basis` column or Airtable rejects UNKNOWN_FIELD_NAME.
      score_basis: SCORE_BASIS,
      Delta: Number(payload.delta ?? payload.scoreDelta ?? 0),
      Date: new Date().toISOString(),
      URL: String(payload.url ?? ""),
    },
  };
}
