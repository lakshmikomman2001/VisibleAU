import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { serviceDb } from "@/db/client";
import { citabilityMethods } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { effectiveTier } from "@/lib/pricing/effective-tier";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isFree = (await effectiveTier(serviceDb, currentUser.organizationId)) === "free";
  const limit = isFree ? 10 : 100;

  // Task XXX: select() returned every column, including effectSizeNotes --
  // which can still carry live-row text not yet re-attributed by the
  // gated VVV/UUU prod update (this route has zero callers today, but it's
  // a real authenticated endpoint anyone logged in could call directly).
  // Narrowed to the fields actually safe to expose.
  const methods = await serviceDb
    .select({
      methodKey: citabilityMethods.methodKey,
      title: citabilityMethods.title,
      description: citabilityMethods.description,
      source: citabilityMethods.source,
      effectSizePct: citabilityMethods.effectSizePct,
      appliesTo: citabilityMethods.appliesTo,
      citationUrl: citabilityMethods.citationUrl,
      sourceType: citabilityMethods.sourceType,
    })
    .from(citabilityMethods)
    .orderBy(desc(citabilityMethods.effectSizePct))
    .limit(limit);

  return NextResponse.json({ methods, total: 47, shown: methods.length });
}
