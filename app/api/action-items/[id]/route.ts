import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, setRlsContext } from "@/db/client";
import { actionItems, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await setRlsContext(db, currentUser.organizationId);

  const { id } = await params;
  const [item] = await db
    .select({
      id: actionItems.id,
      recommendationKey: actionItems.recommendationKey,
      dimension: actionItems.dimension,
      title: actionItems.title,
      action: actionItems.action,
      confidenceLabel: actionItems.confidenceLabel,
      expectedImpactScore: actionItems.expectedImpactScore,
      evidenceRefs: actionItems.evidenceRefs,
      status: actionItems.status,
      brandId: actionItems.brandId,
      brandName: brands.name,
      auditId: actionItems.auditId,
      createdAt: actionItems.createdAt,
      updatedAt: actionItems.updatedAt,
    })
    .from(actionItems)
    .innerJoin(brands, eq(actionItems.brandId, brands.id))
    .where(eq(actionItems.id, id));

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}
