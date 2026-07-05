import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { serviceDb } from "@/db/client";
import { citabilityMethods } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [sub] = await serviceDb
    .select({ tier: subscriptions.tier })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, currentUser.organizationId))
    .limit(1);
  const isFree = (sub?.tier ?? "free") === "free";
  const limit = isFree ? 10 : 100;

  const methods = await serviceDb
    .select()
    .from(citabilityMethods)
    .orderBy(desc(citabilityMethods.effectSizePct))
    .limit(limit);

  return NextResponse.json({ methods, total: 47, shown: methods.length });
}
