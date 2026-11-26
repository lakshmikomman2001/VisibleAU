import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { isEnabled } from "@/lib/flags/flags";
import {
  assertBrandAccess,
  brandAccessErrorResponse,
  recordAction,
  roleRefusal,
} from "@/lib/governance";
import { archiveQuestion } from "@/lib/questions/archive";
import { isUuid } from "@/lib/validation/uuid";

/**
 * S03 part 3 (LLD 8.3.7; contract P02.row.more): POST /api/brands/:id/questions/:qid/archive -- archive a question from
 * the brand's library. 200 `{ archived: true }` (also for one already archived); 409 when the current set asks it;
 * 404 for a question that isn't this brand's. Behind agency_questions (off: 404). Owners, admins and analysts
 * (edit_brand_data). Written to the Audit Trail in the same transaction.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ brandId: string; questionId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { brandId, questionId } = await params;
  if (!isUuid(brandId) || !isUuid(questionId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
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

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const brand = await getBrandForOrg(brandId, currentUser.organizationId, tx);
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const result = await archiveQuestion(tx, {
      organizationId: currentUser.organizationId,
      brandId,
      questionId,
    });
    if (!result.ok) {
      if (result.status === 404) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(result.body, { status: 409 });
    }
    if (!result.alreadyArchived) {
      await recordAction(
        {
          organizationId: currentUser.organizationId,
          userId: currentUser.id,
          action: "brand_question_archived",
          resourceType: "brand",
          resourceId: brandId,
          metadata: { questionId },
        },
        tx,
      );
    }
    return NextResponse.json({ archived: true });
  });
}
