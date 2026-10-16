const DIMS = ["frequency", "position", "sentiment", "context", "accuracy"] as const;

// Display-only relabel: the "accuracy" dimension measures citation rate
// (accuracyDimensionScore), not factual correctness. The internal key (accuracy) is unchanged —
// only DIM_DISPLAY_NAMES below (used for the GHA annotation title shown to users) changes — see
// docs/ops for the Phase 1 writeup.
const DIM_DISPLAY_NAMES: Record<(typeof DIMS)[number], string> = {
  frequency: "Frequency",
  position: "Position",
  sentiment: "Sentiment",
  context: "Context",
  accuracy: "Source citation",
};

export interface GhaAuditInput {
  scores: Record<string, number>;
}

export function buildGha(audit: GhaAuditInput): string {
  const scores = audit.scores ?? {};
  const lines: string[] = [];

  for (const dim of DIMS) {
    const score = scores[dim] ?? 0;
    const label = `${DIM_DISPLAY_NAMES[dim]} Score`;
    const msg = `${score}/100`;

    if (score < 30) {
      lines.push(`::error title=${label}::${msg}`);
    } else if (score < 50) {
      lines.push(`::warning title=${label}::${msg}`);
    } else if (score < 70) {
      lines.push(`::notice title=${label}::${msg}`);
    }
  }

  return lines.join("\n");
}
