import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { reactivateScheduleIfReady } from "@/lib/brands/needs-confirmation";
import {
  assertBrandAccess,
  brandAccessErrorResponse,
  recordAction,
  roleRefusal,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { regeneratePromptPack } from "@/lib/prompts/regenerate-prompt-pack";
import { CATEGORY_KEYS } from "@/lib/prompts/templates";
import type { ConfirmQuestionsResult } from "@/lib/questions/confirm-questions";
import { isUuid } from "@/lib/validation/uuid";

// Vunnara Build 1, Part C.4/C.6: the user's confirmed category/audience
// win over the classifier's guess from this point on; confirmed
// competitors (and ONLY confirmed ones) get merged into brands.
// competitors, the sole source "X vs Y" prompts read from.
const confirmSchema = z.object({
  categories: z.array(z.enum(CATEGORY_KEYS)).min(1).max(5),
  audience: z.enum(["households", "businesses", "both"]),
  confirmedCompetitors: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  // S03 part 7 (LLD 8.3.6, P10 step 3): the questions the Questions step showed, in order, for a new brand. Read only
  // while agency_questions is on; without it the pack regenerates as before.
  questions: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(400),
        source: z.enum(["original", "template", "agency"]),
      }),
    )
    .min(1)
    .max(40)
    .optional(),
});

/** A refused Questions step: thrown out of the transaction so the brand's details aren't saved either. */
class QuestionsRefused extends Error {
  constructor(readonly result: Exclude<ConfirmQuestionsResult, { ok: true }>) {
    super("questions_refused");
  }
}

function refusalResponse(result: Exclude<ConfirmQuestionsResult, { ok: true }>): NextResponse {
  if (result.status === 403) return tierRefusal(new TierInsufficientError(result.requiredTier));
  return NextResponse.json(result.body, { status: result.status });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!isUuid(brandId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    throw e;
  }
  const forbidden = await roleRefusal(currentUser, "manage_brands");
  if (forbidden) return forbidden;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // S03 part 7: the flag is read (and the questions module loaded) only when the Questions step sent its list, so a
  // confirm without one runs exactly as before S03.
  const withQuestions =
    parsed.data.questions !== undefined &&
    (await (
      await import("@/lib/flags/flags")
    ).isEnabled("agency_questions", currentUser.organizationId));

  try {
    return await withRlsContext(currentUser.organizationId, async (tx) => {
      const existing = await getBrandForOrg(brandId, currentUser.organizationId, tx);
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Merge, never replace -- a brand may already have its own
      // user-entered competitors from the wizard; confirming a
      // classifier-suggested one just adds to that list.
      const mergedCompetitors = [
        ...new Set([...existing.competitors, ...parsed.data.confirmedCompetitors]),
      ];

      const [updated] = await tx
        .update(brands)
        .set({
          categories: parsed.data.categories,
          audience: parsed.data.audience,
          categoryConfirmedAt: new Date(),
          competitors: mergedCompetitors,
          classificationStatus: "complete",
          updatedAt: new Date(),
        })
        .where(eq(brands.id, brandId))
        .returning();

      if (withQuestions && parsed.data.questions) {
        // S03 part 7: exactly the questions the step showed become the brand's next set (version 1 for a new brand) and
        // its pack; nothing regenerates them. A refusal rolls the details back too.
        // Loaded only here: without the step this route imports what it did before S03.
        const { confirmQuestions } = await import("@/lib/questions/confirm-questions");
        const result = await confirmQuestions(tx, {
          organizationId: currentUser.organizationId,
          brandId,
          userId: currentUser.id,
          shown: parsed.data.questions,
        });
        if (!result.ok) throw new QuestionsRefused(result);
        await recordAction(
          {
            organizationId: currentUser.organizationId,
            userId: currentUser.id,
            action: "brand_questions_applied",
            resourceType: "brand",
            resourceId: brandId,
            metadata: {
              version: result.version,
              fromVersion: result.fromVersion,
              added: result.added,
              removed: result.removed,
              from: "confirm",
            },
          },
          tx,
        );
      } else {
        // Vunnara Build 1, Part E.2: category/audience/competitors just
        // changed -- regenerate the frozen pack (bumps prompt_pack_version
        // if one already existed) now that location may already be set.
        await regeneratePromptPack(tx, brandId);
      }

      // Build 1 follow-up (entry-point check): if this confirm also
      // means the brand is now fully ready (location was already set),
      // resume any schedule paused on needs_confirmation -- see that
      // function's own comment for why this is the only resume path.
      await reactivateScheduleIfReady(tx, updated);

      return NextResponse.json({ brand: updated });
    });
  } catch (e) {
    if (e instanceof QuestionsRefused) return refusalResponse(e.result);
    throw e;
  }
}
