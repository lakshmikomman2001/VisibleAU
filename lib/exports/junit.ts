import { create } from "xmlbuilder2";
import { DIMENSION_LABELS } from "@/lib/scoring/dimension-labels";
import type { DimensionKey, DimensionResult } from "@/lib/scoring/dimension-result";

const DIMS: readonly DimensionKey[] = ["frequency", "position", "sentiment", "context", "accuracy"];

export interface JunitAuditInput {
  id: string;
  brandId: string;
  brandName?: string;
  dimensions: Record<DimensionKey, DimensionResult>;
  createdAt: Date;
}

export function buildJunit(audit: JunitAuditInput): string {
  // Task #46 Phase 2, Part 1: failures (and skips) only ever come from a
  // dimension that was actually SCORED -- an insufficient_data dimension
  // (no brand-mention rows) never counts toward `failures`, matching the
  // "a zero-mention audit must not fail a CI gate as a regression" rule.
  const failures = DIMS.filter((d) => {
    const dim = audit.dimensions[d];
    return dim.status === "scored" && dim.value < 50;
  }).length;
  // Task #46 Phase 3, Part C: "not_measured" (Sentiment/Context -- no
  // real classifier exists) is skipped the same way "insufficient_data"
  // is -- neither is a failure.
  const skipped = DIMS.filter((d) => audit.dimensions[d].status !== "scored").length;

  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("testsuites", {
    name: "VisibleAU Audit",
    tests: DIMS.length,
    failures,
    skipped,
  });

  const suite = root.ele("testsuite", {
    name: audit.brandName ?? audit.brandId,
    tests: DIMS.length,
    failures,
    skipped,
    timestamp: audit.createdAt.toISOString(),
    time: "0",
  });

  for (const dim of DIMS) {
    const d = audit.dimensions[dim];
    const displayName = DIMENSION_LABELS[dim];
    const tc = suite.ele("testcase", {
      name: `${displayName} score`,
      classname: `dimension.${dim}`,
      time: "0",
    });

    if (d.status === "insufficient_data") {
      // Neutral result, not a failure: the brand was never mentioned, so
      // there was nothing to measure for this dimension -- <skipped/>
      // (not <failure>) is the one JUnit outcome every consumer (Jenkins,
      // GitHub Actions' test reporters, etc.) already renders as
      // "didn't run", never as a build-breaking regression.
      tc.ele("skipped", {
        message: "Insufficient data — brand was not mentioned, excluded from scoring",
      });
      continue;
    }
    if (d.status === "not_measured") {
      // Task #46 Phase 3, Part C: distinct wording from
      // insufficient_data -- there were plenty of mentions, there's
      // just no real classifier behind this dimension yet.
      tc.ele("skipped", {
        message: "Not yet measured — excluded from scoring",
      });
      continue;
    }

    if (d.value < 50) {
      tc.ele("failure", {
        message: `Score ${d.value}/100 — below 50 threshold`,
        type: "ScoreFailure",
      }).txt(`${displayName.toLowerCase()} score: ${d.value}/100.`);
    }
  }

  return root.end({ prettyPrint: true });
}
