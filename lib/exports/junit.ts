import { create } from "xmlbuilder2";

const DIMS = ["frequency", "position", "sentiment", "context", "accuracy"] as const;

// Display-only relabel: the "accuracy" dimension measures citation rate
// (accuracyDimensionScore), not factual correctness. The internal key (accuracy) is unchanged —
// only DIM_DISPLAY_NAMES below (used for the JUnit testcase name/message shown to users) changes
// — see docs/ops for the Phase 1 writeup.
const DIM_DISPLAY_NAMES: Record<(typeof DIMS)[number], string> = {
  frequency: "Frequency",
  position: "Position",
  sentiment: "Sentiment",
  context: "Context",
  accuracy: "Source citation",
};

export interface JunitAuditInput {
  id: string;
  brandId: string;
  brandName?: string;
  scores: Record<string, number>;
  createdAt: Date;
}

export function buildJunit(audit: JunitAuditInput): string {
  const scores = audit.scores ?? {};
  const failures = DIMS.filter((d) => (scores[d] ?? 100) < 50).length;

  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("testsuites", {
    name: "VisibleAU Audit",
    tests: DIMS.length,
    failures,
  });

  const suite = root.ele("testsuite", {
    name: audit.brandName ?? audit.brandId,
    tests: DIMS.length,
    failures,
    timestamp: audit.createdAt.toISOString(),
    time: "0",
  });

  for (const dim of DIMS) {
    const score = scores[dim] ?? 0;
    const displayName = DIM_DISPLAY_NAMES[dim];
    const tc = suite.ele("testcase", {
      name: `${displayName} score`,
      classname: `dimension.${dim}`,
      time: "0",
    });

    if (score < 50) {
      tc.ele("failure", {
        message: `Score ${score}/100 — below 50 threshold`,
        type: "ScoreFailure",
      }).txt(`${displayName.toLowerCase()} score: ${score}/100.`);
    }
  }

  return root.end({ prettyPrint: true });
}
