import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
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
    //
    // Vunnara (19 Oct, post-aa83b3a): the score is the headline -- the
    // Frequency DimensionResult (mention rate), never a blend. Null for an
    // audit with zero organic answers (insufficient_data "no_answers").
    function headlineFor(auditId: string): number | null {
      const headline = resolvedByAuditId.get(auditId)?.headline;
      return headline?.status === "scored" ? headline.value : null;
    }

    const auditsWithScore = recentAudits.map((a) => ({
      id: a.id,
      compositeScore: headlineFor(a.id),
      completedAt: a.completedAt,
    }));

    // An unscored (zero-answer) latest audit reports lastAuditScore: null,
    // never a fabricated 0; an unscored side on either end means there's
    // nothing honest to diff, so change is 0 / trend "flat" -- the same
    // fallback this route already used when there was no prior audit.
    // No audits at all keeps its pre-existing 0.
    const lastScore = auditsWithScore.length === 0 ? 0 : auditsWithScore[0].compositeScore;
    const priorScore = auditsWithScore[1]?.compositeScore ?? lastScore;
    const change = lastScore !== null && priorScore !== null ? lastScore - priorScore : 0;
    const trend = change > 2 ? "up" : change < -2 ? "down" : "flat";

    return NextResponse.json({
      audits: auditsWithScore,
      trend,
      lastAuditScore: lastScore,
      changeVsPriorAudit: change,
    });
  });
}
