import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brandQuestionPacks } from "@/db/schema";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { getTierDefinition, type TierDefinition } from "@/lib/pricing/tiers";
import { loadCurrentQuestionSet } from "@/lib/questions/question-set-store";

/**
 * S03 part 1 (LLD 7.6, 8.3.5; D3, D4, D-QI-BR): a brand's question limits, from its workspace's plan (lib/pricing/
 * tiers.ts) and the question packs assigned to it (brand_question_packs, S10; none until then). Enforced on the
 * server -- when a set is applied (POST /api/brands/:id/question-sets) and when an audit starts (POST /api/audits) --
 * and only reflected in the browser.
 *
 * Two kinds of refusal (LLD amendment 30): writing your own questions on a plan without it is a feature the plan
 * doesn't include (403 plan_required through tierRefusal, by the caller); more everyday questions than the plan and the
 * brand's packs allow is a limit inside a feature the plan has: 402 with the code `question_limit` and appendix E's
 * sentence (QuestionLimitError). At most 5 questions naming the business is a check on the question itself (lib/
 * questions/validate.ts), so 422.
 */

export const QUESTIONS_PER_PACK = 10;
/** A brand may run fewer everyday questions than included, down to this (LLD 8.3.5); the confidence range widens. */
export const MIN_EVERYDAY_QUESTIONS = 5;

export interface QuestionLimits {
  /** The workspace's plan as every gate sees it (effectiveTier: a cancelled plan reads as Free). */
  plan: string;
  includedScoredQuestions: number;
  /** Packs assigned to the brand; counted only on a plan that has packs. */
  packs: number;
  /** Everyday questions the brand may run: included + 10 per pack. */
  everydayAllowed: number;
  everydayMin: number;
  maxBrandedQuestions: number;
  canWriteQuestions: boolean;
  reachesAllowed: number;
}

function definitionOf(plan: string): TierDefinition {
  const def = getTierDefinition(plan) ?? getTierDefinition("free");
  if (!def) throw new Error("lib/pricing/tiers.ts has no free plan");
  return def;
}

/** The limits for a plan and a number of assigned packs. */
export function questionLimitsFor(plan: string, assignedPacks: number): QuestionLimits {
  const def = definitionOf(plan);
  const packs = def.questionPacks ? Math.max(0, Math.trunc(assignedPacks)) : 0;
  return {
    plan: def.key,
    includedScoredQuestions: def.includedScoredQuestions,
    packs,
    everydayAllowed: def.includedScoredQuestions + QUESTIONS_PER_PACK * packs,
    everydayMin: MIN_EVERYDAY_QUESTIONS,
    maxBrandedQuestions: def.maxBrandedQuestions,
    canWriteQuestions: def.canWriteQuestions,
    reachesAllowed: def.reachesAllowed,
  };
}

/** The brand's limits. `db` is the caller's client or transaction, inside the workspace's RLS context. */
export async function getQuestionLimits(
  db: DbClient,
  organizationId: string,
  brandId: string,
): Promise<QuestionLimits> {
  const plan = await effectiveTier(db, organizationId);
  const [row] = await db
    .select({ packs: brandQuestionPacks.packs })
    .from(brandQuestionPacks)
    .where(
      and(
        eq(brandQuestionPacks.brandId, brandId),
        eq(brandQuestionPacks.organizationId, organizationId),
      ),
    )
    .limit(1);
  return questionLimitsFor(plan, row?.packs ?? 0);
}

/** Appendix E's plan-limit sentence (P02.overLimit, P04.overLimit). */
export function questionLimitMessage(limit: number): string {
  return `Your plan includes ${limit} everyday questions per brand. Remove one, or add a question pack.`;
}

export class QuestionLimitError extends Error {
  readonly code = "question_limit" as const;
  readonly status = 402 as const;
  readonly limit: number;
  constructor(limit: number) {
    super(questionLimitMessage(limit));
    this.name = "QuestionLimitError";
    this.limit = limit;
  }
}

/** What a set holds, as the limits count it. */
export interface QuestionSetCounts {
  everyday: number;
  branded: number;
}

/** The refusal a set's counts earn under these limits, or null. */
export function questionLimitError(
  limits: QuestionLimits,
  counts: QuestionSetCounts,
): QuestionLimitError | null {
  if (counts.everyday > limits.everydayAllowed)
    return new QuestionLimitError(limits.everydayAllowed);
  return null;
}

/** Throws QuestionLimitError when the set holds more everyday questions than the brand may run. */
export function assertQuestionLimits(limits: QuestionLimits, counts: QuestionSetCounts): void {
  const error = questionLimitError(limits, counts);
  if (error) throw error;
}

/** A set's counts from its items. */
export function countSet(
  items: ReadonlyArray<{ kind: "everyday" | "branded" }>,
): QuestionSetCounts {
  const branded = items.filter((i) => i.kind === "branded").length;
  return { everyday: items.length - branded, branded };
}

/**
 * When an audit starts: the refusal the brand's current set earns under its limits, or null (also null with no set,
 * when the audit falls back to the stored pack as before S02).
 */
export async function currentSetLimitError(
  db: DbClient,
  organizationId: string,
  brandId: string,
): Promise<QuestionLimitError | null> {
  const set = await loadCurrentQuestionSet(db, brandId);
  if (!set) return null;
  return questionLimitError(
    await getQuestionLimits(db, organizationId, brandId),
    countSet(set.items),
  );
}

/** The 402 body: `{ error: "question_limit", message, limit }`. */
export function questionLimitBody(error: QuestionLimitError): {
  error: "question_limit";
  message: string;
  limit: number;
} {
  return { error: error.code, message: error.message, limit: error.limit };
}
