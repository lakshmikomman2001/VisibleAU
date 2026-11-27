import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isEnabled } from "@/lib/flags/flags";
import {
  assertBrandAccess,
  brandAccessErrorResponse,
  recordAction,
  roleRefusal,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { getQuestionLimits } from "@/lib/questions/limits";
import { copyQuestions } from "@/lib/questions/settings";
import { isUuid } from "@/lib/validation/uuid";

/**
 * S03 part 5 (LLD 8.3.4, 8.3.7; contract P05): POST /api/brands/:id/questions/copy-from { sourceBrandId } -> { added }.
 * The source brand's everyday questions land in this brand's library as suggestions (source agency), places swapped
 * where the two brands have them; never a shared row. Both brands must be the workspace's and the user's to reach
 * (assertBrandAccess on each: another workspace's brand is 404); owners, admins and analysts (edit_brand_data); Growth
 * and up (403 plan_required below it). Behind agency_questions (off: 404). Written to the Audit Trail.
 */
const bodySchema = z.object({ sourceBrandId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { brandId } = await params;
  if (!isUuid(brandId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isEnabled("agency_questions", currentUser.organizationId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
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
  const { sourceBrandId } = parsed.data;
  if (sourceBrandId === brandId) {
    return NextResponse.json(
      { error: "same_brand", message: "Choose two different brands." },
      { status: 422 },
    );
  }
  try {
    await assertBrandAccess(currentUser, brandId);
    await assertBrandAccess(currentUser, sourceBrandId);
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    throw e;
  }
  const forbidden = await roleRefusal(currentUser, "edit_brand_data");
  if (forbidden) return forbidden;

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const limits = await getQuestionLimits(tx, currentUser.organizationId, brandId);
    if (!limits.canWriteQuestions) return tierRefusal(new TierInsufficientError("growth"));
    const result = await copyQuestions(tx, {
      organizationId: currentUser.organizationId,
      sourceBrandId,
      targetBrandId: brandId,
      userId: currentUser.id,
    });
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await recordAction(
      {
        organizationId: currentUser.organizationId,
        userId: currentUser.id,
        action: "brand_questions_copied",
        resourceType: "brand",
        resourceId: brandId,
        metadata: { sourceBrandId, added: result.added },
      },
      tx,
    );
    return NextResponse.json({ added: result.added });
  });
}
