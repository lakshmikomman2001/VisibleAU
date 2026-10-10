import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, citationSourceIntelligence } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  assertBrandAccess,
  assertTier,
  BrandAccessDeniedError,
  TierInsufficientError,
} from "@/lib/governance";
import { getBrandDistinctCitationCount } from "@/lib/trust";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, "growth");
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    if (e instanceof TierInsufficientError)
      return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [sources, totalCitationCount] = await Promise.all([
      tx
        .select({
          id: citationSourceIntelligence.id,
          engine: citationSourceIntelligence.engine,
          sourceType: citationSourceIntelligence.sourceType,
          citationCount: citationSourceIntelligence.citationCount,
          citationShare: citationSourceIntelligence.citationShare,
          brandPresentInSource: citationSourceIntelligence.brandPresentInSource,
          gapSeverity: citationSourceIntelligence.gapSeverity,
          sourceAffinityNote: citationSourceIntelligence.sourceAffinityNote,
        })
        .from(citationSourceIntelligence)
        .where(eq(citationSourceIntelligence.brandId, brandId))
        .orderBy(desc(citationSourceIntelligence.calculatedAt))
        .limit(200),
      // Task #38: the raw getBrandCitationCount counts every replay (~5x
      // inflation) and every call regardless of brand mention -- it was
      // built as an audit-progress-bar denominator, not a coverage
      // figure to show a user. getBrandDistinctCitationCount is the same
      // deduped, organic (non-branded-prompt) sample used elsewhere as
      // the confidence-interval size. See
      // docs/ops/post-launch-db-hardening.md section 38.
      getBrandDistinctCitationCount(tx, brandId),
    ]);

    return NextResponse.json({
      sources: sources.map((s) => ({
        ...s,
        citationShare: s.citationShare == null ? null : Number(s.citationShare),
      })),
      citationCount: totalCitationCount,
    });
  });
}
