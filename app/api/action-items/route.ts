import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { actionItems, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  const dimension = searchParams.get("dimension");
  const statusParam = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? 200), 200);
  const page = Math.max(Number(searchParams.get("page") ?? 1), 1);

  const activeStatuses = statusParam ? [statusParam] : ["open", "in_progress"];
  const conditions = [
    eq(actionItems.organizationId, currentUser.organizationId),
    inArray(actionItems.status, activeStatuses),
    ...(brandId ? [eq(actionItems.brandId, brandId)] : []),
    ...(dimension ? [eq(actionItems.dimension, dimension)] : []),
  ];

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [items, [{ total }]] = await Promise.all([
      tx
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
        .where(and(...conditions))
        .orderBy(asc(actionItems.dimension), desc(actionItems.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      tx
        .select({ total: sql<number>`count(*)::int` })
        .from(actionItems)
        .where(and(...conditions)),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  });
}
