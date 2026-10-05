import { ANSWER_CAPSULE_WORDS, type QuestionHeading } from "./find-questions";

export interface CapsuleCheckResult {
  totalQuestions: number;
  questionsWithCapsule: number;
  capsulePassRate: number;
  score: number;
  /** Set only when the score can't speak for itself -- e.g. there's no
   * answer-capsule structure to credit at all, so a human needs to know
   * WHY the score is 0 rather than reading it as "nothing wrong here." */
  finding: string | null;
}

export function checkCapsuleQuality(questions: QuestionHeading[]): CapsuleCheckResult {
  if (questions.length === 0) {
    // No H2/H3 question-style headings at all -- there is no answer-capsule
    // structure to credit. Full marks here would mean a site with zero
    // Q&A content scores identically to one with perfectly-formed
    // capsules; the absence of the thing being measured is a real gap,
    // not a pass (task KK). The wording is explicit about the H2/H3 scope
    // (task NNN) -- a site whose FAQ headings are all H4/H5/H1 lands here
    // too, and "no Q&A structure" would overstate what was actually
    // checked.
    return {
      totalQuestions: 0,
      questionsWithCapsule: 0,
      capsulePassRate: 0,
      score: 0,
      finding: `We checked your H2/H3 headings and found no question-style headings — add FAQ/Q&A sections with ${ANSWER_CAPSULE_WORDS.min}-${ANSWER_CAPSULE_WORDS.max} word answers to form answer capsules.`,
    };
  }

  const withCapsule = questions.filter((q) => q.hasCapsule).length;
  const passRate = withCapsule / questions.length;
  const score = Math.round(passRate * 6);

  return {
    totalQuestions: questions.length,
    questionsWithCapsule: withCapsule,
    capsulePassRate: Math.round(passRate * 100) / 100,
    score,
    finding: null,
  };
}
