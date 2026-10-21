import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brandEntityScores, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { recomputeEntityDisplayScore } from "@/lib/brand-entity/score";
import {
  assertBrandAccess,
  assertTier,
  BrandAccessDeniedError,
  TierInsufficientError,
} from "@/lib/governance";
import { ExplainabilityService } from "@/lib/platform/explainability";
import { TRUST_CHECK_IMPLEMENTED } from "@/lib/trust";

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
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [latest] = await tx
      .select()
      .from(brandEntityScores)
      .where(eq(brandEntityScores.brandId, brandId))
      .orderBy(desc(brandEntityScores.checkedAt))
      .limit(1);

    if (!latest) return NextResponse.json(null);

    // Sri, 21 Oct follow-up, item 5: this used to divide the STORED
    // score_of_10 by the new 8-point max -- correct for a row computed
    // under the new weights, but score_of_10 used to run up to 10 (the
    // same three facts below, PLUS up to 2 points from the now-deleted
    // directory checker), so a pre-hotfix row's old-scale numerator
    // divided by the new denominator silently inflated its percentage.
    // Recomputing from the row's own abn/wikipedia/auTld facts (never
    // invalidated) instead gives every row, old or new, the one current
    // answer -- see lib/brand-entity/score.ts's own comment.
    const displayScore = recomputeEntityDisplayScore(latest);

    // Trust Intelligence honesty pass follow-up: Knowledge Panel / Wikidata
    // are hardcoded stubs -- gate topAction on whether they're actually
    // implemented, not on their (possibly stub-written) stored value.
    const topAction =
      TRUST_CHECK_IMPLEMENTED.knowledgePanel && !latest.knowledgePanelPresent
        ? "Establish a Knowledge Panel — critical for AI visibility."
        : TRUST_CHECK_IMPLEMENTED.wikidata && !latest.wikidataEntryPresent
          ? "Create a Wikidata entry to strengthen entity recognition."
          : undefined;

    const annotation = ExplainabilityService.annotate({
      score: displayScore,
      scoreLabel: "Entity Authority",
      maxScore: 100,
      context: { brandName: brand.name, dimension: "entity authority" },
      topAction,
    });

    // Bug found alongside this follow-up: this route was reconstructing
    // auDirectoryPresence from the stub directory-checker's
    // hipagesPresent/yellowPagesPresent/etc columns (always false) and
    // using it to OVERWRITE the real auDirectoryPresence jsonb column
    // already spread in from `...latest` -- which is written by the real
    // technical-audit pipeline (lib/brand-entity/au-directory-aggregate.ts).
    // Removed: the real data now flows through unmodified.

    const scoreLevel: "Low" | "Medium" | "High" =
      displayScore <= 33 ? "Low" : displayScore <= 66 ? "Medium" : "High";

    return NextResponse.json({
      ...latest,
      // Vunnara (21 Oct, "directory listings... never scraping", Part
      // A3): never present auDirectoryPresence, even a previously-
      // written one already sitting in the row -- the checker that
      // wrote it requested a page neither hipages nor ServiceSeeking
      // actually permitted, so no value it ever produced (old or new)
      // is trustworthy. Directory presence now comes only from the
      // owner's own confirmation (Part C) or AI-answer citations (Part
      // D), on their own surfaces.
      auDirectoryPresence: null,
      // Trust Intelligence honesty pass follow-up: never present a
      // Knowledge Panel / Wikidata result (even a previously-stub-written
      // one already sitting in the row) while the real check doesn't exist.
      knowledgePanelPresent: TRUST_CHECK_IMPLEMENTED.knowledgePanel
        ? latest.knowledgePanelPresent
        : null,
      knowledgePanelAccurate: TRUST_CHECK_IMPLEMENTED.knowledgePanel
        ? latest.knowledgePanelAccurate
        : null,
      knowledgePanelUrl: TRUST_CHECK_IMPLEMENTED.knowledgePanel ? latest.knowledgePanelUrl : null,
      wikidataEntryPresent: TRUST_CHECK_IMPLEMENTED.wikidata ? latest.wikidataEntryPresent : null,
      wikidataEntryUrl: TRUST_CHECK_IMPLEMENTED.wikidata ? latest.wikidataEntryUrl : null,
      knowledgePanelImplemented: TRUST_CHECK_IMPLEMENTED.knowledgePanel,
      wikidataImplemented: TRUST_CHECK_IMPLEMENTED.wikidata,
      ...annotation,
      scoreLevel,
      // Sri, 21 Oct follow-up, item 5: the one correct, read-time 0-100
      // score -- the client reads this instead of recomputing its own
      // from the raw (and scale-ambiguous) scoreOf10 field above.
      displayScore,
    });
  });
}
