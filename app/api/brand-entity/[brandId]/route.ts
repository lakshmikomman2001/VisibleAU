import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { brandEntityScores, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { recomputeEntityDisplayScore } from "@/lib/brand-entity/score";
import { isUuid } from "@/lib/validation/uuid";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!isUuid(brandId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

    const [latest] = await tx
      .select()
      .from(brandEntityScores)
      .where(eq(brandEntityScores.brandId, brandId))
      .orderBy(desc(brandEntityScores.checkedAt))
      .limit(1);

    if (!latest) return NextResponse.json({ error: "No entity score found" }, { status: 404 });

    return NextResponse.json({
      ...latest,
      // Sri, 21 Oct follow-up, item 4: this route was found passing the
      // raw row through unmodified -- the sibling route (entity-score/
      // route.ts) already nulls this out, but this one didn't. The
      // checker that wrote auDirectoryPresence (lib/brand-entity/
      // au-directory-aggregate.ts, deleted Part A) requested a page
      // neither hipages nor ServiceSeeking permitted, so no value it
      // ever produced is trustworthy, old or new. Directory presence
      // now comes only from the owner's own confirmation (Part C) or
      // AI-answer citations (Part D), on their own surfaces.
      auDirectoryPresence: null,
      // Sri, 21 Oct follow-up, item 5: the raw score_of_10 above is
      // scale-ambiguous for a pre-hotfix row (it used to run up to 10,
      // not 8) -- this is the one recomputed, always-correct number,
      // from the row's own abn/wikipedia/auTld facts (lib/brand-entity/
      // score.ts). scoreOf10 itself is left in place as a raw
      // diagnostic value, never as the thing a caller computes a
      // percentage from.
      displayScore: recomputeEntityDisplayScore(latest),
    });
  });
}
