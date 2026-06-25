import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { markOnboardingComplete } from "@/lib/onboarding/state-machine";

export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await markOnboardingComplete(currentUser.organizationId);
  return NextResponse.json({ success: true });
}
