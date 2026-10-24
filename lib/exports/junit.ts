import { create } from "xmlbuilder2";
import {
  type CiExportInput,
  NOT_MEASURED_TEXT,
  positionLine,
  sourceCitationLine,
  VISIBILITY_FAIL_BELOW_PCT,
  visibilityCheck,
} from "./ci-checks";

export interface JunitAuditInput extends CiExportInput {
  id: string;
  brandId: string;
  brandName?: string;
  createdAt: Date;
}

/**
 * Five test cases. Only Visibility can fail -- below VISIBILITY_FAIL_BELOW_PCT
 * (lib/exports/ci-checks.ts) -- or be skipped, when there were too few
 * answers to measure it. Typical position and Source citation always pass,
 * with their counts in <system-out>: audit #36 follow-up, they used to be
 * 0-100 scores that failed below 50. Sentiment and Context are skipped (no
 * classifier).
 */
export function buildJunit(audit: JunitAuditInput): string {
  const visibility = visibilityCheck(audit);
  const visibilityFails = visibility.kind === "error" || visibility.kind === "warning";
  const failures = visibilityFails ? 1 : 0;
  const skipped = 2 + (visibility.kind === "skipped" ? 1 : 0);
  const tests = 5;

  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("testsuites", {
    name: "VisibleAU Audit",
    tests,
    failures,
    skipped,
  });

  const suite = root.ele("testsuite", {
    name: audit.brandName ?? audit.brandId,
    tests,
    failures,
    skipped,
    timestamp: audit.createdAt.toISOString(),
    time: "0",
  });

  const visibilityCase = suite.ele("testcase", {
    name: "Visibility (mention rate)",
    classname: "dimension.frequency",
    time: "0",
  });
  if (visibility.kind === "skipped") {
    visibilityCase.ele("skipped", { message: visibility.text });
  } else if (visibilityFails) {
    visibilityCase
      .ele("failure", {
        message: `${visibility.text} — below the ${VISIBILITY_FAIL_BELOW_PCT}% gate`,
        type: "VisibilityBelowGate",
      })
      .txt(`${visibility.text}.`);
  } else {
    visibilityCase.ele("system-out").txt(visibility.text);
  }

  suite
    .ele("testcase", { name: "Typical position", classname: "dimension.position", time: "0" })
    .ele("system-out")
    .txt(positionLine(audit));
  suite
    .ele("testcase", { name: "Source citation", classname: "dimension.accuracy", time: "0" })
    .ele("system-out")
    .txt(sourceCitationLine(audit));

  for (const [name, classname] of [
    ["Sentiment", "dimension.sentiment"],
    ["Context", "dimension.context"],
  ] as const) {
    suite
      .ele("testcase", { name, classname, time: "0" })
      .ele("skipped", { message: NOT_MEASURED_TEXT });
  }

  return root.end({ prettyPrint: true });
}
