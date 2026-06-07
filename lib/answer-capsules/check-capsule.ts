import type { QuestionHeading } from "./find-questions";

export interface CapsuleCheckResult {
  totalQuestions: number;
  questionsWithCapsule: number;
  capsulePassRate: number;
  score: number;
}

export function checkCapsuleQuality(questions: QuestionHeading[]): CapsuleCheckResult {
  if (questions.length === 0) {
    return { totalQuestions: 0, questionsWithCapsule: 0, capsulePassRate: 1.0, score: 6 };
  }

  const withCapsule = questions.filter((q) => q.hasCapsule).length;
  const passRate = withCapsule / questions.length;
  const score = Math.round(passRate * 6);

  return {
    totalQuestions: questions.length,
    questionsWithCapsule: withCapsule,
    capsulePassRate: Math.round(passRate * 100) / 100,
    score,
  };
}
