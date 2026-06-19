import { describe, expect, it } from "vitest";
import { checkCapsuleQuality } from "@/lib/answer-capsules/check-capsule";
import type { QuestionHeading } from "@/lib/answer-capsules/find-questions";

function q(hasCapsule: boolean): QuestionHeading {
  return {
    tag: "h2",
    question: "What is X?",
    followingText: "Some answer text here.",
    hasCapsule,
    wordCount: hasCapsule ? 22 : 5,
  };
}

describe("checkCapsuleQuality", () => {
  it("returns score 6 for no questions (vacuously clean)", () => {
    const result = checkCapsuleQuality([]);
    expect(result.score).toBe(6);
    expect(result.totalQuestions).toBe(0);
    expect(result.questionsWithCapsule).toBe(0);
  });

  it("returns score 6 when all questions have capsules", () => {
    const result = checkCapsuleQuality([q(true), q(true), q(true)]);
    expect(result.score).toBe(6);
    expect(result.questionsWithCapsule).toBe(3);
    expect(result.totalQuestions).toBe(3);
  });

  it("returns score 0 when no questions have capsules", () => {
    const result = checkCapsuleQuality([q(false), q(false), q(false)]);
    expect(result.score).toBe(0);
    expect(result.questionsWithCapsule).toBe(0);
  });

  it("returns proportional score for mixed capsules", () => {
    const result = checkCapsuleQuality([q(true), q(false)]);
    expect(result.score).toBe(3);
    expect(result.questionsWithCapsule).toBe(1);
    expect(result.totalQuestions).toBe(2);
  });

  it("questionsWithCapsule matches filter(hasCapsule).length", () => {
    const questions = [q(true), q(false), q(true), q(false), q(true)];
    const result = checkCapsuleQuality(questions);
    expect(result.questionsWithCapsule).toBe(questions.filter((qq) => qq.hasCapsule).length);
    expect(result.totalQuestions).toBe(questions.length);
  });

  it("score is always in [0, 6]", () => {
    for (let i = 0; i <= 10; i++) {
      const qs = Array.from({ length: 10 }, (_, j) => q(j < i));
      const result = checkCapsuleQuality(qs);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(6);
    }
  });
});
