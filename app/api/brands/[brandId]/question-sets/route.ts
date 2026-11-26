import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { QUESTION_REACHES } from "@/db/schema/questions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { isEnabled } from "@/lib/flags/flags";
import {
  assertBrandAccess,
  brandAccessErrorResponse,
  recordAction,
  roleRefusal,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { applyQuestionSet } from "@/lib/questions/apply";
import { isUuid } from "@/lib/validation/uuid";

/**
 * S03 part 3 (LLD 8.3.1, 8.3.7; contract P04): POST /api/brands/:id/question-sets -- apply a new question set from the
 * next audit. Body `{ baseVersion, items: [{ questionId? | text, replaces?, reach, position }], count? }`.
 * 201 `{ version }`; 409 when `baseVersion` isn't current (someone else applied first); 402 over the plan's everyday
 * questions; 403 plan_required for typed questions below Growth; 422 when a check fails. Behind agency_questions (off:
 * 404, as if the route didn't exist). Owners, admins and analysts (edit_brand_data); a brand in another workspace is
 * 404. The whole apply is one transaction under the workspace's RLS context, written to the Audit Trail with it.
 */
const itemSchema = z.object({
  questionId: z.string().uuid().optional(),
  text: z.string().max(1000).optional(),
  replaces: z.string().uuid().optional(),
  reach: z.enum(QUESTION_REACHES),
  position: z.number().int().min(0).max(999),
});
const bodySchema = z.object({
  baseVersion: z.number().int().min(0),
  items: z.array(itemSchema).min(1).max(60),
  count: z.number().int().min(0).max(1000).optional(),
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
    const brand = await getBrandForOrg(brandId, currentUser.organizationId, tx);
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const result = await applyQuestionSet(tx, {
      organizationId: currentUser.organizationId,
      brandId,
      userId: currentUser.id,
      baseVersion: parsed.data.baseVersion,
      items: parsed.data.items,
      count: parsed.data.count,
    });
    if (!result.ok) {
      if (result.status === 403) return tierRefusal(new TierInsufficientError(result.requiredTier));
      return NextResponse.json(result.body, { status: result.status });
    }
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
        },
      },
      tx,
    );
    return NextResponse.json({ version: result.version }, { status: 201 });
  });
}
