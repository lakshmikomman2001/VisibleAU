import { DIMENSION_LABELS } from "@/lib/scoring/dimension-labels";
import type { DimensionKey, DimensionResult } from "@/lib/scoring/dimension-result";

const DIMS: readonly DimensionKey[] = ["frequency", "position", "sentiment", "context", "accuracy"];

const RULES = DIMS.map((dim, i) => {
  const displayName = DIMENSION_LABELS[dim];
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
  dimensions: Record<DimensionKey, DimensionResult>;
  scoreComposite: string | number;
  createdAt: Date;
}

export function buildSarif(audit: SarifAuditInput) {
  const results = DIMS.flatMap((dim) => {
    const d = audit.dimensions[dim];
    const ruleId = RULES[DIMS.indexOf(dim)].id;
    const location = {
      physicalLocation: {
        artifactLocation: {
          uri: `brand/${audit.brandId}`,
          uriBaseId: "%SRCROOT%",
        },
      },
    };

    // Task #46 Phase 2, Part 1: a zero-mention audit must not fail a CI
    // gate as if it were a real regression. An insufficient_data dimension
    // (no brand-mention rows to measure Position/Sentiment/Context/Source
    // citation from) gets its OWN result, always at SARIF level "note" --
    // never "error"/"warning" -- so it never trips a SARIF-consuming CI
    // gate that treats those two levels as build-breaking. "note" (not
    // omitting the result entirely) is the deliberate choice here: it
    // keeps the dimension visible in the SARIF output (so a human/tool
    // reading results sees WHY four dimensions are silent) without ever
    // reading as a quality finding.
    if (d.status === "insufficient_data") {
      return [
        {
          ruleId,
          level: "note" as const,
          message: {
            text: `${DIMENSION_LABELS[dim].toLowerCase()} insufficient data — brand was not mentioned, excluded from scoring`,
          },
          locations: [location],
        },
      ];
    }
    // Task #46 Phase 3, Part C: Sentiment/Context have no real
    // classifier behind them (lib/scoring/dimension-result.ts) -- same
    // "note" level as insufficient_data, distinct wording.
    if (d.status === "not_measured") {
      return [
        {
          ruleId,
          level: "note" as const,
          message: {
            text: `${DIMENSION_LABELS[dim].toLowerCase()} not yet measured — excluded from scoring`,
          },
          locations: [location],
        },
      ];
    }

    if (d.value < 70) {
      return [
        {
          ruleId,
          level: d.value < 30 ? "error" : d.value < 50 ? "warning" : ("note" as string),
          message: { text: `${DIMENSION_LABELS[dim].toLowerCase()} score ${d.value}/100` },
          locations: [location],
        },
      ];
    }

    return [];
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
