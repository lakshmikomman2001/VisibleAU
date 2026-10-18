import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
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
    if (e instanceof BrandAccessDeniedError) {
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    }
    throw e;
  }

  const existing = await withRlsContext(currentUser.organizationId, (tx) =>
    getBrandForOrg(brandId, currentUser.organizationId, tx),
  );
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await inngest.send({ name: "brand/created", data: { brandId } });

  return NextResponse.json({ retrying: true });
}
