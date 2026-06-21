import { and, desc, eq } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, setRlsContext } from "@/db/client";
import { brands, driftAlerts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setRlsContext(db, currentUser.organizationId);

  const { searchParams } = new URL(req.url);
  const acknowledged = searchParams.get("acknowledged");

  const conditions = [
    eq(driftAlerts.organizationId, currentUser.organizationId),
  ];
  if (acknowledged === "false")
    conditions.push(eq(driftAlerts.acknowledged, false));
  if (acknowledged === "true")
    conditions.push(eq(driftAlerts.acknowledged, true));

  const alerts = await db
    .select({ ...getTableColumns(driftAlerts), brandName: brands.name })
    .from(driftAlerts)
    .innerJoin(brands, eq(driftAlerts.brandId, brands.id))
    .where(and(...conditions))
    .orderBy(desc(driftAlerts.createdAt))
    .limit(100);

  return NextResponse.json({ alerts });
}
