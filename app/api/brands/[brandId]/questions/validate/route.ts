import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { QUESTION_REACHES } from "@/db/schema/questions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isEnabled } from "@/lib/flags/flags";
import {
  assertBrandAccess,
  brandAccessErrorResponse,
  roleRefusal,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { getQuestionLimits } from "@/lib/questions/limits";
import { validateQuestion } from "@/lib/questions/validate";
import { loadValidationContext } from "@/lib/questions/validation-context";
import { isUuid } from "@/lib/validation/uuid";

/**
 * S03 part 2 (LLD 8.3.2, 8.3.7; contract P03): POST /api/brands/:id/questions/validate `{ text, reach }` ->
 * `{ ok, kind, checks[] }` -- the add drawer's checks, from the same lib/questions/validate.ts the apply route runs
 * again, against the brand's live library and current set. Writing your own questions is Growth and up (403
 * plan_required below it, LLD amendment 30). Behind agency_questions (off: 404). Owners, admins and analysts
 * (edit_brand_data); a brand in another workspace is 404. Read-only, under the workspace's RLS context.
 */
const bodySchema = z.object({
  text: z.string().max(1000),
  reach: z.enum(QUESTION_REACHES),
});

export async function POST(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { brandId } = await params;
  if (!isUuid(brandId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isEnabled("agency_questions", currentUser.organizationId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    throw e;
  }
  const forbidden = await roleRefusal(currentUser, "edit_brand_data");
  if (forbidden) return forbidden;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const limits = await getQuestionLimits(tx, currentUser.organizationId, brandId);
    if (!limits.canWriteQuestions) return tierRefusal(new TierInsufficientError("growth"));
    const ctx = await loadValidationContext(tx, {
      organizationId: currentUser.organizationId,
      brandId,
      reach: parsed.data.reach,
      maxBranded: limits.maxBrandedQuestions,
    });
    if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const result = validateQuestion(parsed.data.text, ctx);
    return NextResponse.json({ ok: result.ok, kind: result.kind, checks: result.checks });
  });
}
