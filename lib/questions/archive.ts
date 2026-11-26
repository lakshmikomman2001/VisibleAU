import { and, eq, isNull } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brandQuestionSetItems, brandQuestionSets, brandQuestions } from "@/db/schema";

/**
 * S03 part 3 (LLD 8.3.7, 7.1; contract P02.row.more "Archive"): archive a question from a brand's library. A question
 * any set used is archived, never deleted, so each answer stays tied to the words asked; one the current set asks
 * can't be archived (409: remove it from the set and apply first). The brand row is locked, as an apply locks it, so an
 * archive and an apply never cross.
 */
export type ArchiveResult =
  | { ok: true; alreadyArchived: boolean }
  | { ok: false; status: 404 }
  | { ok: false; status: 409; body: { error: "in_current_set"; message: string } };

export const IN_CURRENT_SET_COPY =
  "This question is in the current set. Remove it from the set and apply, then archive it.";

export async function archiveQuestion(
  tx: DbClient,
  input: { organizationId: string; brandId: string; questionId: string },
): Promise<ArchiveResult> {
  const [question] = await tx
    .select({ id: brandQuestions.id, archivedAt: brandQuestions.archivedAt })
    .from(brandQuestions)
    .where(
      and(
        eq(brandQuestions.id, input.questionId),
        eq(brandQuestions.brandId, input.brandId),
        eq(brandQuestions.organizationId, input.organizationId),
      ),
    )
    .for("update");
  if (!question) return { ok: false, status: 404 };
  if (question.archivedAt) return { ok: true, alreadyArchived: true };

  const [inCurrent] = await tx
    .select({ id: brandQuestionSetItems.questionId })
    .from(brandQuestionSetItems)
    .innerJoin(brandQuestionSets, eq(brandQuestionSets.id, brandQuestionSetItems.setId))
    .where(
      and(
        eq(brandQuestionSets.brandId, input.brandId),
        eq(brandQuestionSets.isCurrent, true),
        eq(brandQuestionSetItems.questionId, input.questionId),
      ),
    )
    .limit(1);
  if (inCurrent) {
    return {
      ok: false,
      status: 409,
      body: { error: "in_current_set", message: IN_CURRENT_SET_COPY },
    };
  }
  await tx
    .update(brandQuestions)
    .set({ status: "archived", archivedAt: new Date() })
    .where(and(eq(brandQuestions.id, input.questionId), isNull(brandQuestions.archivedAt)));
  return { ok: true, alreadyArchived: false };
}
