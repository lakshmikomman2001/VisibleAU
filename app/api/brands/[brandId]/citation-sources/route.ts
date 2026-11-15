import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  assertBrandAccess,
  assertTier,
  brandAccessErrorResponse,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";
import { getBrandDistinctCitationCount } from "@/lib/trust";
import { getLatestAuditCitationSources } from "@/lib/trust/citation-intelligence";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, brandFeaturePlan("citation_sources"));
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    if (e instanceof TierInsufficientError) return tierRefusal(e);
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

    const [{ audit, categories, enginesWithoutCitations }, totalCitationCount] = await Promise.all([
      // 17 Nov, part 3: the brand's latest complete audit, grouped from that audit's own everyday answers
      // when the page asks (getLatestAuditCitationSources), so the page names its audit, "Covered" uses the
      // audit page's mention rule, and no older audit's stored rows stand in for it. It read the stored
      // aggregate (getCurrentCitationSources), which named no audit, kept a "Covered" from before the mention
      // rule, and fell back to an older audit's per-audit rows (replay-inflated before the run_number filter).
      //
      // Task #46 (4th follow-up): the result is pre-split into real
      // categories and "cited nothing" engines -- the page no longer
      // needs its own ad-hoc NO_CITATIONS_SOURCE_TYPE string compare.
      getLatestAuditCitationSources(tx, brandId),
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
      audit: audit && { auditNumber: audit.auditNumber, completedAt: audit.completedAt },
      categories,
      enginesWithoutCitations,
      citationCount: totalCitationCount,
    });
  });
}
