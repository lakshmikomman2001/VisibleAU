const DIMS = [
  "frequency",
  "position",
  "sentiment",
  "context",
  "accuracy",
] as const;

const RULES = DIMS.map((dim, i) => ({
  id: `VA00${i + 1}`,
  name: `${dim.charAt(0).toUpperCase()}${dim.slice(1)}Score`,
  shortDescription: { text: `AI ${dim} dimension score` },
  helpUri: `https://visibleau.com/docs/scoring#${dim}`,
}));

export interface SarifAuditInput {
  id: string;
  brandId: string;
  scores: Record<string, number>;
  scoreComposite: string | number;
  createdAt: Date;
}

export function buildSarif(audit: SarifAuditInput) {
  const scores = audit.scores ?? {};
  const results = DIMS.filter((dim) => (scores[dim] ?? 100) < 70).map(
    (dim) => {
      const score = scores[dim] ?? 0;
      return {
        ruleId: RULES[DIMS.indexOf(dim)].id,
        level:
          score < 30 ? "error" : score < 50 ? "warning" : ("note" as string),
        message: { text: `${dim} score ${score}/100` },
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
    },
  );

  return {
    $schema:
      "https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json",
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
