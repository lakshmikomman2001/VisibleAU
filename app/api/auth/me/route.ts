import { NextResponse } from "next/server";
import { serviceDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { roleOf } from "@/lib/governance";
import { effectiveTier } from "@/lib/pricing/effective-tier";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    organizationId: user.organizationId,
    // Team follow-ups, item 6: the role every server check reads (the membership's, else the
    // profile's), so the Team page offers only what the API allows. It used to map the profile's role,
    // "member" to analyst, while the API refused that profile everything.
    role: await roleOf(user),
    email: user.email,
    name: user.name ?? null,
    tier: await effectiveTier(serviceDb, user.organizationId),
  });
}
