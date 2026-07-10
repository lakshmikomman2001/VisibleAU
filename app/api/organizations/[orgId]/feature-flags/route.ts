import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getOrgFlags, CANONICAL_FLAG_KEYS } from "@/lib/governance";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (orgId !== currentUser.organizationId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dbFlags = await getOrgFlags(currentUser.organizationId);

  const resolved: Record<string, boolean> = {};
  for (const key of CANONICAL_FLAG_KEYS) {
    if (key in dbFlags) {
      resolved[key] = dbFlags[key];
    } else {
      const envKey = key.toUpperCase();
      resolved[key] = process.env[envKey] === "true";
    }
  }

  return NextResponse.json(resolved);
}
