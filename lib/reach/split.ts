import type { QuestionReach } from "@/db/schema";
import { REACH_ORDER } from "./places";

/**
 * S04 part 6 (LLD 8.4.1; contract P01.reach): the reach card's numbers, the same in the card and in PUT
 * /api/brands/:id/reaches (no database: the card imports it).
 * - Local keeps at least 4 questions; any other enabled reach at least 1; a reach that's off has 0.
 * - The enabled reaches' questions together stay within the plan's everyday questions (plus packs).
 * - Adding a reach splits the everyday questions evenly across the enabled reaches, Local at least 4 and taking the
 *   remainder: 10 across Local, NSW and Australia is 4, 3, 3; across Local and NSW 5, 5.
 * - A reach with fewer than 5 questions is a small sample (contract P01.reach.legend: "when a reach has < 5
 *   questions", Local included).
 */

export const LOCAL_MIN_QUESTIONS = 4;
export const OTHER_REACH_MIN_QUESTIONS = 1;
export const SMALL_SAMPLE_BELOW = 5;

export const LIMIT_REACHED_COPY = "Limit reached. Lower another area or add a question pack.";
export const LOCAL_ALWAYS_ON_COPY = "Local is always on.";

export type ReachTargets = Partial<Record<QuestionReach, number>>;

/** The enabled reaches in reach order, Local always first. */
export function enabledInOrder(enabled: Iterable<QuestionReach>): QuestionReach[] {
  const on = new Set(enabled);
  return REACH_ORDER.filter((r) => r === "local" || on.has(r));
}

/** The default split of `total` everyday questions across the enabled reaches. */
export function defaultSplit(enabled: Iterable<QuestionReach>, total: number): ReachTargets {
  const on = enabledInOrder(enabled);
  const others = on.filter((r) => r !== "local");
  if (others.length === 0) return { local: total };
  const even = Math.floor(total / on.length);
  const local = Math.max(LOCAL_MIN_QUESTIONS, total - even * others.length);
  const rest = Math.max(0, total - local);
  const base = Math.floor(rest / others.length);
  let extra = rest - base * others.length;
  const out: ReachTargets = { local };
  for (const r of others) {
    out[r] = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
  }
  return out;
}

export function minQuestionsFor(reach: QuestionReach): number {
  return reach === "local" ? LOCAL_MIN_QUESTIONS : OTHER_REACH_MIN_QUESTIONS;
}

/** The enabled reaches' questions together. */
export function usedQuestions(targets: ReachTargets, enabled: Iterable<QuestionReach>): number {
  return enabledInOrder(enabled).reduce((sum, r) => sum + (targets[r] ?? 0), 0);
}

/** A stepper's range: 0 when the reach is off; else its minimum to the limit less the other reaches' questions. */
export function stepperBounds(
  reach: QuestionReach,
  targets: ReachTargets,
  enabled: Iterable<QuestionReach>,
  limit: number,
): { min: number; max: number } {
  const on = enabledInOrder(enabled);
  if (!on.includes(reach)) return { min: 0, max: 0 };
  const others = on.filter((r) => r !== reach).reduce((sum, r) => sum + (targets[r] ?? 0), 0);
  const min = minQuestionsFor(reach);
  return { min, max: Math.max(min, limit - others) };
}

export function isSmallSample(questions: number): boolean {
  return questions > 0 && questions < SMALL_SAMPLE_BELOW;
}

/** P01.reach.legend's tooltip for a small sample. */
export function smallSampleNote(questions: number): string {
  return `Small sample (${questions} questions): this figure can move a lot between audits.`;
}
