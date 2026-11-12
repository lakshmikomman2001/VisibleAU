import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { assertBrandAccess, brandAccessErrorResponse, roleRefusal } from "@/lib/governance";
import { inngest } from "@/lib/inngest/client";
import { isUuid } from "@/lib/validation/uuid";

/**
 * Vunnara Build 1, Part C.5: a brand stuck at classification_status =
 * 'failed' (classifyAndStoreBrand now re-throws instead of swallowing
 * the error, so Inngest's own retries: 3 already tried 3 times and
 * gave up) needs a way to try again without the user editing anything
 * -- re-sends the same "brand/created" event classify-on-brand-create.ts
 * already listens for. classifyAndStoreBrand's own early-return guard
 * only skips brands already "complete", so this is safe to call for
 * "failed", "pending" or "needs_confirmation" brands alike.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
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

  const existing = await withRlsContext(currentUser.organizationId, async (tx) => {
    const brand = await getBrandForOrg(brandId, currentUser.organizationId, tx);
    // 13 Nov (part 1): the brand page shows "working out your business type" again, and waits
    // CLASSIFICATION_TIMEOUT_MS from now (updated_at) before letting the owner choose. A complete brand is
    // left as it is: the classifier skips it, so "pending" would never end.
    if (brand) {
      await tx
        .update(brands)
        .set({ classificationStatus: "pending", updatedAt: new Date() })
        .where(and(eq(brands.id, brandId), ne(brands.classificationStatus, "complete")));
    }
    return brand;
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await inngest.send({ name: "brand/created", data: { brandId } });

  return NextResponse.json({ retrying: true });
}
