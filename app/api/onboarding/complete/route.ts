import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { roleRefusal } from "@/lib/governance";
import { markOnboardingComplete } from "@/lib/onboarding/state-machine";

/** Marks the workspace's onboarding complete, for everyone in it: an owner's or admin's to do (Sri, 8 Nov). */
export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const forbidden = await roleRefusal(currentUser, "complete_onboarding");
  if (forbidden) return forbidden;

  await markOnboardingComplete(currentUser.organizationId);
  return NextResponse.json({ success: true });
}
