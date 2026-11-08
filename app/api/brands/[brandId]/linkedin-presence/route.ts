import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, linkedinPresenceAudits } from "@/db/schema";
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
    await assertTier(currentUser.organizationId, brandFeaturePlan("linkedin_presence"));
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    if (e instanceof TierInsufficientError) return tierRefusal(e);
    throw e;
  }

  // Trust Intelligence honesty pass: LinkedIn presence has never been a
  // real check (the scoring input is a hardcoded stub) -- refuse to read
  // or present any stored row, real or stub, until the real check lands.
  // See docs/ops/post-launch-db-hardening.md section 34.
  if (!TRUST_CHECK_IMPLEMENTED.linkedinPresence) {
    return NextResponse.json(NOT_YET_IMPLEMENTED_RESPONSE);
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
      .from(linkedinPresenceAudits)
      .where(eq(linkedinPresenceAudits.brandId, brandId))
      .orderBy(desc(linkedinPresenceAudits.auditedAt))
      .limit(1);

    if (!latest) return NextResponse.json(null);

    // 9 Nov (part 9): a row without a presence score is "not measured" -- presenceScore stays null and
    // nothing is annotated from a made-up 0 (lib/scoring/measured.ts).
    if (latest.presenceScore === null) {
      return NextResponse.json({
        ...latest,
        presenceScore: null,
        rationale: `${NOT_MEASURED}: the last LinkedIn check for ${brand.name} didn't produce a presence score.`,
        confidence_label: null,
        confidence_note: null,
        top_action: null,
        scoreLevel: null,
      });
    }

    const annotation = ExplainabilityService.annotate({
      score: latest.presenceScore,
      scoreLabel: "LinkedIn Presence",
      maxScore: 100,
      context: { brandName: brand.name, dimension: "LinkedIn presence" },
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
