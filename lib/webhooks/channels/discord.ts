export function formatDiscord(eventName: string, payload: Record<string, unknown>) {
  const severity = payload.severity as string | undefined;
  const colour =
    severity === "significant_drop"
      ? 0xef4444
      : severity === "significant_rise"
        ? 0x22c55e
        : 0x3b82f6;

  const brandName = String(payload.brandName ?? "Unknown");
  const score = payload.scoreComposite ?? payload.currentScore ?? "—";
  const delta = payload.delta ?? payload.scoreDelta;
  const deltaStr =
    delta != null
      ? `${Number(delta) > 0 ? "+" : ""}${delta}`
      : "—";

  return {
    embeds: [
      {
        title: `${brandName} — ${eventName}`,
        color: colour,
        fields: [
          { name: "Score", value: String(score), inline: true },
          { name: "Delta", value: deltaStr, inline: true },
        ],
        url: payload.url ?? undefined,
        footer: { text: "VisibleAU" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}
