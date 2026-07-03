import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { audits, brands, queryFanOutResults } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const auditIdParam = searchParams.get("auditId");

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select()
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    if (!brand)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    let scopedAuditId = auditIdParam;
    if (!scopedAuditId || !z.string().uuid().safeParse(scopedAuditId).success) {
      const [latestAudit] = await tx
        .select({ id: audits.id })
        .from(audits)
        .where(and(eq(audits.brandId, brandId), eq(audits.status, "complete")))
        .orderBy(desc(audits.completedAt))
        .limit(1);
      scopedAuditId = latestAudit?.id ?? null;
    }

    if (!scopedAuditId) {
      return NextResponse.json({ groups: [] });
    }

    const rows = await tx
      .select()
      .from(queryFanOutResults)
      .where(
        and(
          eq(queryFanOutResults.brandId, brandId),
          eq(queryFanOutResults.auditId, scopedAuditId),
        ),
      )
      .orderBy(desc(queryFanOutResults.runAt))
      .limit(100);

    const grouped = new Map<string, {
      originalPrompt: string;
      results: Array<{
        subQuery: string;
        subQueryRank: number;
        brandAppeared: boolean;
        brandPosition: number | null;
        contentSimilarityScore: string | null;
        aboveThreshold: boolean | null;
      }>;
    }>();

    for (const row of rows) {
      const key = row.originalPrompt;
      const group = grouped.get(key) ?? { originalPrompt: key, results: [] };
      group.results.push({
        subQuery: row.subQuery,
        subQueryRank: row.subQueryRank,
        brandAppeared: row.brandAppeared,
        brandPosition: row.brandPosition,
        contentSimilarityScore: row.contentSimilarityScore,
        aboveThreshold: row.aboveThreshold,
      });
      grouped.set(key, group);
    }

    return NextResponse.json({
      groups: Array.from(grouped.values()),
    });
  });
}
