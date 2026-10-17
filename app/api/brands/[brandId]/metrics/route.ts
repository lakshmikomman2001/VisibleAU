import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { NOT_MEASURED_DIMENSION, resolveComposite } from "@/lib/scoring/dimension-result";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    throw e;
  }

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
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const recentAudits = await tx
      .select({
        id: audits.id,
        completedAt: audits.completedAt,
      })
      .from(audits)
      .where(and(eq(audits.brandId, brandId), eq(audits.status, "complete")))
      .orderBy(desc(audits.completedAt))
      .limit(20);

    // Task #46 (fix: stored value contradicting its own CI), follow-up
    // #2: one batched query for every one of this brand's recent
    // complete audits (never one query per audit), recomputed live from
    // real citations, never the stored score_composite column.
    const resolvedByAuditId = await resolveOrganicDimensions(
      tx,
      recentAudits.map((a) => a.id),
    );
    function compositeFor(auditId: string): number | null {
      const resolved = resolvedByAuditId.get(auditId);
      if (!resolved) return null;
      return resolveComposite({
        frequency: resolved.frequency,
        position: resolved.position,
        sentiment: NOT_MEASURED_DIMENSION,
        context: NOT_MEASURED_DIMENSION,
        accuracy: resolved.accuracy,
      }).value;
    }

    const auditsWithScore = recentAudits.map((a) => ({
      id: a.id,
      compositeScore: compositeFor(a.id),
      completedAt: a.completedAt,
    }));

    const lastScore = auditsWithScore[0]?.compositeScore ?? 0;
    const priorScore = auditsWithScore[1]?.compositeScore ?? lastScore;
    const change = lastScore - priorScore;
    const trend = change > 2 ? "up" : change < -2 ? "down" : "flat";

    return NextResponse.json({
      audits: auditsWithScore,
      trend,
      lastAuditScore: lastScore,
      changeVsPriorAudit: change,
    });
  });
}
