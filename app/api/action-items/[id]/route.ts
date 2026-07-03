import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { actionItems, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [item] = await tx
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
      .where(and(eq(actionItems.id, id), eq(actionItems.organizationId, currentUser.organizationId)));

    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(item);
  });
}
