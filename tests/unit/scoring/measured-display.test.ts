/**
 * Audit #36 (25 Oct), items 2-3 -- Position, Source citation and the
 * per-engine rows show the counts behind them, never a 0-100 score.
 */
import { describe, expect, it } from "vitest";
import {
  engineAnswerLine,
  failedNotCountedNote,
  formatTypicalRank,
  positionCard,
  SMALL_SAMPLE_MENTIONS,
  smallSampleNote,
  sourceCitationCard,
} from "@/lib/scoring/measured-display";

// Production Audit #36: 3 verified mentions, all 3 ranked (median #4), all 3 linked a source.
const AUDIT_36 = { mentionedCount: 3, rankedCount: 3, medianPosition: 4, sourcedCount: 3 };

describe("Position card", () => {
  it("Audit #36 shows #4 and how many mentions were ranked -- not 94.0", () => {
    const card = positionCard(AUDIT_36);
    expect(card).toEqual({
      kind: "measured",
      value: "#4",
      detail: "3 of 3 mentions were in a ranked list",
      line: "#4 (3 of 3 mentions were in a ranked list)",
      smallSampleNote: "Based on 3 mentions — small sample",
    });
    expect(JSON.stringify(card)).not.toMatch(/94|44|100/);
  });

  it("a partly ranked audit says so, with the right verb", () => {
    const card = positionCard({ ...AUDIT_36, rankedCount: 1, medianPosition: 2 });
    expect(card.kind === "measured" && card.detail).toBe("1 of 3 mentions was in a ranked list");
  });

  it("mentions with no list position: not ranked; no mentions: not mentioned", () => {
    expect(positionCard({ ...AUDIT_36, rankedCount: 0, medianPosition: null }).kind).toBe(
      "not_ranked",
    );
    expect(positionCard({ ...AUDIT_36, mentionedCount: 0, rankedCount: 0 }).kind).toBe(
      "not_mentioned",
    );
  });

  it("a median between two ranks shows both, never a rounded single rank", () => {
    expect(formatTypicalRank(4)).toBe("#4");
    expect(formatTypicalRank(3.5)).toBe("#3–4");
  });
});

describe("Source citation card", () => {
  it("Audit #36 shows 3 of 3 -- not 100.0 or a 44-100 bar", () => {
    const card = sourceCitationCard(AUDIT_36);
    expect(card).toEqual({
      kind: "measured",
      value: "3 of 3",
      detail: "mentions linked a source",
      line: "3 of 3 mentions linked a source",
      smallSampleNote: "Based on 3 mentions — small sample",
    });
  });

  it("no mentions: not mentioned", () => {
    expect(sourceCitationCard({ ...AUDIT_36, mentionedCount: 0, sourcedCount: 0 }).kind).toBe(
      "not_mentioned",
    );
  });
});

describe("small-sample note", () => {
  it("shows below SMALL_SAMPLE_MENTIONS (5) and is hidden at 5 or more", () => {
    expect(SMALL_SAMPLE_MENTIONS).toBe(5);
    expect(smallSampleNote(1)).toBe("Based on 1 mention — small sample");
    expect(smallSampleNote(4)).toBe("Based on 4 mentions — small sample");
    expect(smallSampleNote(5)).toBeNull();
    expect(smallSampleNote(12)).toBeNull();
    expect(smallSampleNote(0)).toBeNull();

    const four = { mentionedCount: 4, rankedCount: 4, medianPosition: 2, sourcedCount: 1 };
    const five = { mentionedCount: 5, rankedCount: 5, medianPosition: 2, sourcedCount: 1 };
    for (const card of [positionCard(four), sourceCitationCard(four)]) {
      expect(card.kind === "measured" && card.smallSampleNote).toBe(
        "Based on 4 mentions — small sample",
      );
    }
    for (const card of [positionCard(five), sourceCitationCard(five)]) {
      expect(card.kind === "measured" && card.smallSampleNote).toBeNull();
    }
  });

  it("Position's note counts the ranked mentions it rests on, not every mention", () => {
    const card = positionCard({
      mentionedCount: 8,
      rankedCount: 2,
      medianPosition: 3,
      sourcedCount: 8,
    });
    expect(card.kind === "measured" && card.smallSampleNote).toBe(
      "Based on 2 mentions — small sample",
    );
  });
});

describe("per-engine row", () => {
  it("k of n plus the rate; no answers at all has no rate", () => {
    expect(engineAnswerLine({ sampleCount: 10, mentionedCount: 1 })).toEqual({
      counts: "1 of 10",
      rate: "10%",
    });
    expect(engineAnswerLine({ sampleCount: 9, mentionedCount: 0 })).toEqual({
      counts: "0 of 9",
      rate: "0%",
    });
    expect(engineAnswerLine({ sampleCount: 0, mentionedCount: 0 })).toEqual({
      counts: "No answers",
      rate: null,
    });
  });

  it("a failed call gets its own note; none when nothing failed", () => {
    expect(failedNotCountedNote(1)).toBe("1 failed — not counted");
    expect(failedNotCountedNote(0)).toBeNull();
  });

  it("the note carries its reason as text, when given", () => {
    expect(failedNotCountedNote(3, "2 timeouts, 1 error")).toBe(
      "3 failed — not counted (2 timeouts, 1 error)",
    );
    expect(failedNotCountedNote(0, "1 error")).toBeNull();
  });
});
