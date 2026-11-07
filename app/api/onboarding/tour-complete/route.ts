import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { dismissNotice, PRODUCT_TOUR_NOTICE } from "@/lib/onboarding/dismissed-notices";

/**
 * A person finishing or skipping the product tour: done for them, whatever their role (Sri, 8 Nov). It
 * used to set the workspace's productTourComplete, so a viewer skipping it ended it for the owner too; a
 * workspace that already has that flag keeps it (app/(auth)/dashboard/page.tsx).
 */
export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dismissNotice(currentUser.organizationId, currentUser.id, PRODUCT_TOUR_NOTICE);
  return NextResponse.json({ ok: true });
}
