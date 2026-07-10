import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { serviceDb } from "@/db/client";
import { subscriptions } from "@/db/schema/subscriptions";
import { getCurrentUser } from "@/lib/auth/current-user";

const ROLE_MAP: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  analyst: "analyst",
  member: "analyst",
  viewer: "viewer",
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const [sub] = await serviceDb
    .select({ tier: subscriptions.tier })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, user.organizationId))
    .limit(1);

  return NextResponse.json({
    id: user.id,
    organizationId: user.organizationId,
    role: ROLE_MAP[user.role] ?? "viewer",
    email: user.email,
    name: user.name ?? null,
    tier: sub?.tier ?? "free",
  });
}
