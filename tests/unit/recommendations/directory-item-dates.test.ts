/**
 * S01C part 5d (LLD amendment 65): "Action Center directory items print dates as '20 Oct 2026' (new and refreshed
 * items)". lib/recommendations/triggers.ts wrote "(checked 2026-10-20)" and "You told us on 2026-10-15 ..."; it now
 * writes the dates as the PDF's evidence lines and the Beyond tiles do (formatCheckDate). Items already stored keep
 * their words.
 */
import { describe, expect, it } from "vitest";
import {
  type DirectoryVisibilityFinding,
  NO_EVIDENCE,
  type RecommendationEvidence,
} from "@/lib/recommendations/evidence";
import { evaluateTriggers } from "@/lib/recommendations/triggers";
import type { TriggerContext } from "@/lib/recommendations/types";

const ctx: TriggerContext = {
  scoreFrequency: "20.00",
  scoreSentimentNumeric: "80.00",
  scoreContextNumeric: "80.00",
  scoreComposite: "20.00",
  confidenceIntervals: {},
  vertical: "tradies",
  mentionDetail: { mentionedCount: 6, rankedCount: 6, medianPosition: 2, sourcedCount: 5 },
};

function finding(over: Partial<DirectoryVisibilityFinding> = {}): DirectoryVisibilityFinding {
  return {
    key: "hipages",
    name: "hipages",
    citedCount: 9,
    totalAnswers: 40,
    citedUrls: [
      { url: "https://hipages.example.test/listing", displayUrl: "hipages.example.test/listing" },
    ],
    ownerProfileCited: false,
    ownerStatus: null,
    ownerConfirmedAt: null,
    ...over,
  };
}

function directoryItem(f: DirectoryVisibilityFinding) {
  const evidence: RecommendationEvidence = {
    ...NO_EVIDENCE,
    directories: {
      status: "ok",
      data: { computedAt: "2026-10-20T03:00:00.000Z", findings: [f] },
    },
  };
  const rec = evaluateTriggers(ctx, evidence).find(
    (r) => r.recommendationKey === "directory-visibility",
  );
  if (!rec) throw new Error("directory-visibility did not fire");
  return rec;
}

describe("the Action Center's directory item: dates as '20 Oct 2026'", () => {
  it("the check's date", () => {
    const rec = directoryItem(finding());
    expect(rec.action).toContain("(checked 20 Oct 2026)");
    expect(JSON.stringify(rec)).not.toMatch(/\d{4}-\d{2}-\d{2}(?!T)/);
  });

  it("the owner's own answer's date", () => {
    const rec = directoryItem(
      finding({ ownerStatus: "not_listed", ownerConfirmedAt: "2026-10-15T01:00:00.000Z" }),
    );
    expect(rec.action).toContain("You told us you're not listed on hipages");
    const refs = JSON.stringify(rec.evidenceRefs);
    expect(refs).toContain("You told us on 15 Oct 2026 that you're not listed on hipages.");
    expect(refs).not.toContain("2026-10-15 ");
  });
});
