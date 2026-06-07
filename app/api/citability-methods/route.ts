import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { citabilityMethods } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isFree = currentUser.organization.tier === "free";
  const limit = isFree ? 10 : 100;

  const methods = await db
    .select()
    .from(citabilityMethods)
    .orderBy(desc(citabilityMethods.effectSizePct))
    .limit(limit);

  return NextResponse.json({ methods, total: 47, shown: methods.length });
}
