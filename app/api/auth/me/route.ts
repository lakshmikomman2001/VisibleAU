import { NextResponse } from "next/server";
import { serviceDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { effectiveTier } from "@/lib/pricing/effective-tier";

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

  return NextResponse.json({
    id: user.id,
    organizationId: user.organizationId,
    role: ROLE_MAP[user.role] ?? "viewer",
    email: user.email,
    name: user.name ?? null,
    tier: await effectiveTier(serviceDb, user.organizationId),
  });
}
