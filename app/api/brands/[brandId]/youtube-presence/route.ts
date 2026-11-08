import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, youtubePresenceAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  assertBrandAccess,
  assertTier,
  BrandAccessDeniedError,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { ExplainabilityService } from "@/lib/platform/explainability";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";
import { NOT_MEASURED } from "@/lib/scoring/measured";
import { NOT_YET_IMPLEMENTED_RESPONSE, TRUST_CHECK_IMPLEMENTED } from "@/lib/trust";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, brandFeaturePlan("youtube_presence"));
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    if (e instanceof TierInsufficientError) return tierRefusal(e);
    throw e;
  }

  // Trust Intelligence honesty pass: kept as a flag-driven gate (not
  // deleted) so a future regression in the real check can be neutralized
  // again instantly by flipping this back to false. See
  // docs/ops/post-launch-db-hardening.md section 34/35.
  if (!TRUST_CHECK_IMPLEMENTED.youtubePresence) {
    return NextResponse.json(NOT_YET_IMPLEMENTED_RESPONSE);
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id, name: brands.name, domain: brands.domain })
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
      .from(youtubePresenceAudits)
      .where(eq(youtubePresenceAudits.brandId, brandId))
      .orderBy(desc(youtubePresenceAudits.auditedAt))
      .limit(1);

    if (!latest) return NextResponse.json(null);

    // Trust Intelligence honesty pass (real YouTube check): "unavailable"
    // (missing key / quota / network error) must never render as a
    // measured score -- return it as its own distinct shape instead of
    // going through ExplainabilityService.annotate() with a fabricated 0.
    if (latest.checkStatus === "unavailable") {
      return NextResponse.json({
        checkStatus: "unavailable" as const,
        unavailableReason: latest.unavailableReason,
        auditedAt: latest.auditedAt,
      });
    }

    // Tightened matching (live false-match: "Bondi Plumbing" matched a
    // channel actually belonging to "Get Plumbing"): a name-only
    // candidate is never scored and never fed into the Overall Trust
    // Score. Returned as its own distinct shape -- the candidate's
    // identity/stats are shown for the agency to confirm/correct, but no
    // score, scoreLevel, or rationale is computed.
    //
    // Task #37: gaps carries [reason, conflictingDomain?] (see
    // lib/trust/youtube-presence-check.ts) so the page can render the
    // distinct "different business" copy, not just the generic
    // "might be yours" wording, when a conflicting domain was actually
    // detected. brandDomain is included for the "{domain} (not
    // {brandDomain})" wording -- already-fetched brand data, no schema
    // change.
    if (latest.checkStatus === "unconfirmed") {
      return NextResponse.json({
        checkStatus: "unconfirmed" as const,
        channelId: latest.channelId,
        channelTitle: latest.channelTitle,
        channelUrl: latest.channelUrl,
        channelSubscriberCount: latest.channelSubscriberCount,
        channelTotalVideos: latest.channelTotalVideos,
        matchConfidence: latest.matchConfidence,
        gaps: latest.gaps,
        brandDomain: brand.domain,
      });
    }

    // 9 Nov (part 9): a row without a presence score is "not measured" -- presenceScore stays null and
    // nothing is annotated from a made-up 0 (lib/scoring/measured.ts).
    if (latest.presenceScore === null) {
      return NextResponse.json({
        ...latest,
        presenceScore: null,
        rationale: `${NOT_MEASURED}: the last YouTube check for ${brand.name} didn't produce a presence score.`,
        confidence_label: null,
        confidence_note: null,
        top_action: null,
        scoreLevel: null,
      });
    }

    const annotation = ExplainabilityService.annotate({
      score: latest.presenceScore,
      scoreLabel: "YouTube Presence",
      maxScore: 100,
      context: { brandName: brand.name, dimension: "YouTube presence" },
      topAction:
        latest.gaps && Array.isArray(latest.gaps) && latest.gaps.length > 0
          ? String(latest.gaps[0])
          : undefined,
    });

    const ps = latest.presenceScore;
    const scoreLevel: "Low" | "Medium" | "High" = ps <= 33 ? "Low" : ps <= 66 ? "Medium" : "High";

    return NextResponse.json({ ...latest, ...annotation, scoreLevel });
  });
}
