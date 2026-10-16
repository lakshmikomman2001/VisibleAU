const DIMS = ["frequency", "position", "sentiment", "context", "accuracy"] as const;

// Display-only relabel: the "accuracy" dimension measures citation rate
// (accuracyDimensionScore), not factual correctness. The internal key (accuracy) is unchanged —
// only DIM_DISPLAY_NAMES below (used for the SARIF rule name/message shown to users) changes —
// see docs/ops for the Phase 1 writeup.
const DIM_DISPLAY_NAMES: Record<(typeof DIMS)[number], string> = {
  frequency: "Frequency",
  position: "Position",
  sentiment: "Sentiment",
  context: "Context",
  accuracy: "Source citation",
};

const RULES = DIMS.map((dim, i) => {
  const displayName = DIM_DISPLAY_NAMES[dim];
  return {
    id: `VA00${i + 1}`,
    name: `${displayName.replace(/\s+/g, "")}Score`,
    shortDescription: { text: `AI ${displayName.toLowerCase()} dimension score` },
    helpUri: `https://visibleau.com/docs/scoring#${dim}`,
  };
});

export interface SarifAuditInput {
  id: string;
  brandId: string;
  scores: Record<string, number>;
  scoreComposite: string | number;
  createdAt: Date;
}

export function buildSarif(audit: SarifAuditInput) {
  const scores = audit.scores ?? {};
  const results = DIMS.filter((dim) => (scores[dim] ?? 100) < 70).map((dim) => {
    const score = scores[dim] ?? 0;
    return {
      ruleId: RULES[DIMS.indexOf(dim)].id,
      level: score < 30 ? "error" : score < 50 ? "warning" : ("note" as string),
      message: { text: `${DIM_DISPLAY_NAMES[dim].toLowerCase()} score ${score}/100` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: `brand/${audit.brandId}`,
              uriBaseId: "%SRCROOT%",
            },
          },
        },
      ],
    };
  });

  return {
    $schema: "https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "VisibleAU",
            version: "1.0.0",
            rules: RULES,
          },
        },
        results,
        invocations: [{ executionSuccessful: true }],
      },
    ],
  };
}
