/**
 * S01 part 4 (LLD 8.8.5, T7): general advice backed by evidence. Medium is hidden unless the audit cited medium.com
 * (in at least 3 everyday answers); LinkedIn shows on a NumbaTek-#52-shaped audit with "LinkedIn was cited in N of 40
 * answers"; other advice needs a verified research source; anything else isn't shown.
 */
import { describe, expect, it } from "vitest";
import {
  AUDIT_EVIDENCE_MIN_ANSWERS,
  adviceEvidence,
  countPlatformCitations,
} from "@/lib/recommendations/general-advice-evidence";

const answer = (urls: string[], organic = true) => ({
  organic,
  citedSources: urls.map((url) => ({ domain: new URL(url).hostname, url })),
});

/** 40 everyday answers; LinkedIn company pages cited in 9, a person's profile in 1 more, Medium in 2. */
function numbaTekShape() {
  const answers = [];
  for (let i = 0; i < 40; i += 1) {
    const urls = ["https://www.localbusinessguide.com.au/x"];
    if (i < 9) urls.push(`https://www.linkedin.com/company/provider-${i}`);
    if (i === 9) urls.push("https://au.linkedin.com/in/someone");
    if (i < 2) urls.push("https://medium.com/@someone/managed-it-tips");
    answers.push(answer(urls));
  }
  // A branded answer citing LinkedIn: not an everyday answer, not counted.
  answers.push(answer(["https://www.linkedin.com/company/numbatek-it"], false));
  return answers;
}

describe("countPlatformCitations", () => {
  it("counts everyday answers citing each platform once", () => {
    expect(countPlatformCitations(numbaTekShape())).toEqual({
      everydayAnswers: 40,
      answersCiting: { LinkedIn: 10, Medium: 2 },
    });
  });
});

describe("adviceEvidence", () => {
  const citations = countPlatformCitations(numbaTekShape());

  it("LinkedIn advice shows on NumbaTek #52's shape, with its count", () => {
    expect(adviceEvidence({ recommendationKey: "linkedin-presence" }, citations)).toEqual({
      kind: "audit",
      line: "LinkedIn was cited in 10 of 40 answers",
    });
  });

  it(`Medium advice is hidden below ${AUDIT_EVIDENCE_MIN_ANSWERS} answers citing medium.com, even with a research source`, () => {
    expect(
      adviceEvidence(
        {
          recommendationKey: "medium-presence",
          evidenceRefs: [{ source: "Some study", sourceType: "research" }],
        },
        citations,
      ),
    ).toBeNull();
    const cited = countPlatformCitations([
      ...numbaTekShape(),
      answer(["https://medium.com/a"]),
      answer(["https://medium.com/b"]),
    ]);
    expect(adviceEvidence({ recommendationKey: "medium-presence" }, cited)).toEqual({
      kind: "audit",
      line: "Medium was cited in 4 of 42 answers",
    });
  });

  it("other advice needs a verified research source; an estimate isn't evidence", () => {
    expect(
      adviceEvidence(
        {
          recommendationKey: "faq-content",
          evidenceRefs: [
            { source: "Vunnara estimate", sourceType: "vunnara_estimate" },
            { source: "Princeton GEO study (2024)", sourceType: "research" },
          ],
        },
        citations,
      ),
    ).toEqual({ kind: "research", line: "Princeton GEO study (2024)" });
    expect(
      adviceEvidence(
        {
          recommendationKey: "faq-content",
          evidenceRefs: [{ source: "x", sourceType: "vunnara_estimate" }],
        },
        citations,
      ),
    ).toBeNull();
    expect(
      adviceEvidence({ recommendationKey: "press-mentions", evidenceRefs: null }, citations),
    ).toBeNull();
  });
});

describe("evidenceBackedAdvice: what the audit page lists while report_v2 is on", () => {
  it("keeps only backed items, each with its evidence line, in the order given", async () => {
    const { evidenceBackedAdvice } = await import("@/lib/recommendations/general-advice-evidence");
    const items = [
      { id: "1", recommendationKey: "medium-presence", evidenceRefs: [] },
      { id: "2", recommendationKey: "linkedin-presence", evidenceRefs: [] },
      { id: "3", recommendationKey: "press-mentions", evidenceRefs: [] },
    ];
    expect(
      evidenceBackedAdvice(items, countPlatformCitations(numbaTekShape())).map((i) => [
        i.id,
        i.evidence.line,
      ]),
    ).toEqual([["2", "LinkedIn was cited in 10 of 40 answers"]]);
  });
});
