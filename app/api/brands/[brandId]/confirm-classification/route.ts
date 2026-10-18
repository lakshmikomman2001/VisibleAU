import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { reactivateScheduleIfReady } from "@/lib/brands/needs-confirmation";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { CATEGORY_KEYS } from "@/lib/prompts/templates";
import { regeneratePromptPack } from "@/lib/prompts/regenerate-prompt-pack";
import { isUuid } from "@/lib/validation/uuid";

// Vunnara Build 1, Part C.4/C.6: the user's confirmed category/audience
// win over the classifier's guess from this point on; confirmed
// competitors (and ONLY confirmed ones) get merged into brands.
// competitors, the sole source "X vs Y" prompts read from.
const confirmSchema = z.object({
  categories: z.array(z.enum(CATEGORY_KEYS)).min(1).max(5),
  audience: z.enum(["households", "businesses", "both"]),
  confirmedCompetitors: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!isUuid(brandId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError) {
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    }
    throw e;
  }

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

  return withRlsContext(currentUser.organizationId, async (tx) => {
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

    // Vunnara Build 1, Part E.2: category/audience/competitors just
    // changed -- regenerate the frozen pack (bumps prompt_pack_version
    // if one already existed) now that location may already be set.
    await regeneratePromptPack(tx, brandId);

    // Build 1 follow-up (entry-point check): if this confirm also
    // means the brand is now fully ready (location was already set),
    // resume any schedule paused on needs_confirmation -- see that
    // function's own comment for why this is the only resume path.
    await reactivateScheduleIfReady(tx, updated);

    return NextResponse.json({ brand: updated });
  });
}
