import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { brands, driftAlerts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OF_LIVE_BRAND } from "@/lib/drift/pending-alerts";

export async function GET(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const acknowledged = searchParams.get("acknowledged");

  // Leftovers task, part 6: a deleted brand's alerts aren't listed (as on the drift alerts page).
  const conditions = [eq(driftAlerts.organizationId, currentUser.organizationId), OF_LIVE_BRAND];
  if (acknowledged === "false") conditions.push(eq(driftAlerts.acknowledged, false));
  if (acknowledged === "true") conditions.push(eq(driftAlerts.acknowledged, true));

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const alerts = await tx
      .select({ ...getTableColumns(driftAlerts), brandName: brands.name })
      .from(driftAlerts)
      .innerJoin(brands, eq(driftAlerts.brandId, brands.id))
      .where(and(...conditions))
      .orderBy(desc(driftAlerts.createdAt))
      .limit(100);

    return NextResponse.json({ alerts });
  });
}
