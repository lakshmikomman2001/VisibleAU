export function formatAirtable(eventName: string, payload: Record<string, unknown>) {
  return {
    fields: {
      Event: eventName,
      Brand: String(payload.brandName ?? ""),
      Score: Number(payload.scoreComposite ?? payload.currentScore ?? 0),
      Delta: Number(payload.delta ?? payload.scoreDelta ?? 0),
      Date: new Date().toISOString(),
      URL: String(payload.url ?? ""),
    },
  };
}
