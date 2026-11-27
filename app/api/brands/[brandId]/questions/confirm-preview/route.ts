import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isEnabled } from "@/lib/flags/flags";
import { assertBrandAccess, brandAccessErrorResponse, roleRefusal } from "@/lib/governance";
import { CATEGORY_KEYS } from "@/lib/prompts/templates";
import { loadConfirmPreview } from "@/lib/questions/confirm-questions";
import { isUuid } from "@/lib/validation/uuid";

/**
 * S03 part 7 (LLD 8.3.6; contract P10 step 3): POST /api/brands/:id/questions/confirm-preview { categories, audience,
 * confirmedCompetitors } -> the questions "Confirm your business details" will save for these (unsaved) facts, the
 * spares to swap in and what the plan allows. Reads only. The confirm route's rule (manage_brands) and brand access;
 * behind agency_questions (off: 404, and the card confirms as before).
 */
const previewSchema = z.object({
  categories: z.array(z.enum(CATEGORY_KEYS)).min(1).max(5),
  audience: z.enum(["households", "businesses", "both"]),
  confirmedCompetitors: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
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
  const forbidden = await roleRefusal(currentUser, "manage_brands");
  if (forbidden) return forbidden;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const preview = await withRlsContext(currentUser.organizationId, (tx) =>
    loadConfirmPreview(tx, {
      organizationId: currentUser.organizationId,
      brandId,
      facts: {
        categories: parsed.data.categories,
        audience: parsed.data.audience,
        competitors: parsed.data.confirmedCompetitors,
      },
    }),
  );
  if (!preview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(preview);
}
