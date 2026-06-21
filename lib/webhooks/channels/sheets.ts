export function formatSheets(eventName: string, payload: Record<string, unknown>) {
  return {
    event: eventName,
    brand: String(payload.brandName ?? ""),
    score: payload.scoreComposite ?? payload.currentScore ?? "",
    delta: payload.delta ?? payload.scoreDelta ?? "",
    timestamp: new Date().toISOString(),
    url: String(payload.url ?? ""),
  };
}
