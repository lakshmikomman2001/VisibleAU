import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, brandAccessErrorResponse } from "@/lib/governance";
import { dismissNotice, healthCheckBannerNotice } from "@/lib/onboarding/dismissed-notices";

/** Overview (7 Nov), item 4: "Dismiss" on the Health Check banner, for the signed-in person only. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    const res = brandAccessErrorResponse(e);
    if (res) return res;
    throw e;
  }

  await dismissNotice(currentUser.organizationId, currentUser.id, healthCheckBannerNotice(brandId));
  return NextResponse.json({ dismissed: true });
}
