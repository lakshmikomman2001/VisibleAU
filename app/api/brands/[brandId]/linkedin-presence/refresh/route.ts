import { and, eq, isNull } from "drizzle-orm";
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
} from "@/lib/governance";
import { NOT_YET_IMPLEMENTED_RESPONSE, scoreLinkedinPresence, TRUST_CHECK_IMPLEMENTED } from "@/lib/trust";

export async function POST(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
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

  // Trust Intelligence honesty pass: this endpoint has never performed a
  // real LinkedIn lookup -- every input was hardcoded, which always
  // produced the same minimum score. Refuse to write a fabricated row.
  // See docs/ops/post-launch-db-hardening.md section 34.
  if (!TRUST_CHECK_IMPLEMENTED.linkedinPresence) {
    return NextResponse.json(NOT_YET_IMPLEMENTED_RESPONSE, { status: 501 });
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id, name: brands.name, organizationId: brands.organizationId })
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const result = scoreLinkedinPresence({
      companyPageUrl: null,
      companyPageExists: false,
      companyPageFollowers: 0,
      companyPosts30d: 0,
      companyArticlesCount: 0,
      founderProfileUrl: null,
      founderProfileExists: false,
      founderFollowers: 0,
      founderPosts30d: 0,
      founderArticlesCount: 0,
      founderArticles500plus: 0,
      knowledgeSharingRatio: 0,
      originalContentRatio: 0,
      semanticRelevanceScore: 0,
    });

    const [row] = await tx
      .insert(linkedinPresenceAudits)
      .values({
        brandId,
        organizationId: currentUser.organizationId,
        presenceScore: result.presenceScore,
        gaps: result.gaps,
        auditedAt: new Date(),
      })
      .returning();

    return NextResponse.json(row);
  });
}
