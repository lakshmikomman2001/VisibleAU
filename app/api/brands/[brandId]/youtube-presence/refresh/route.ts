import { and, eq, isNull } from "drizzle-orm";
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
} from "@/lib/governance";
import { buildYoutubePresenceAuditRow, NOT_YET_IMPLEMENTED_RESPONSE, TRUST_CHECK_IMPLEMENTED } from "@/lib/trust";

const BODY_SCHEMA = z.object({ channelUrl: z.string().trim().min(1).optional() }).optional();

export async function POST(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
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

  // Trust Intelligence honesty pass: kept as a flag-driven gate (not
  // deleted) so a future regression in the real check can be neutralized
  // again instantly by flipping this back to false. See
  // docs/ops/post-launch-db-hardening.md section 34/35.
  if (!TRUST_CHECK_IMPLEMENTED.youtubePresence) {
    return NextResponse.json(NOT_YET_IMPLEMENTED_RESPONSE, { status: 501 });
  }

  // Confirm/correct action (PART A of the matching tightening): an
  // optional user-confirmed channel URL/handle in the request body
  // always wins over the fuzzy search -- see
  // docs/ops/post-launch-db-hardening.md section 36.
  const parsedBody = BODY_SCHEMA.safeParse(await req.json().catch(() => undefined));
  const confirmedUrlInput = parsedBody.success ? parsedBody.data?.channelUrl : undefined;

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({
        id: brands.id,
        name: brands.name,
        domain: brands.domain,
        organizationId: brands.organizationId,
        youtubeChannelUrl: brands.youtubeChannelUrl,
      })
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (confirmedUrlInput) {
      await tx
        .update(brands)
        .set({ youtubeChannelUrl: confirmedUrlInput, updatedAt: new Date() })
        .where(eq(brands.id, brandId));
    }

    const confirmedChannelUrl = confirmedUrlInput ?? brand.youtubeChannelUrl;
    const row = await buildYoutubePresenceAuditRow(brand.name, brand.domain, confirmedChannelUrl);

    const [inserted] = await tx
      .insert(youtubePresenceAudits)
      .values({
        brandId,
        organizationId: currentUser.organizationId,
        channelUrl: row.channelUrl,
        channelId: row.channelId,
        channelTitle: row.channelTitle,
        channelExists: row.channelExists,
        channelSubscriberCount: row.channelSubscriberCount,
        channelTotalVideos: row.channelTotalVideos,
        lastUploadAt: row.lastUploadAt,
        matchConfidence: row.matchConfidence,
        checkStatus: row.checkStatus,
        unavailableReason: row.unavailableReason,
        citedVideoUrls: [],
        presenceScore: row.presenceScore,
        gaps: row.gaps,
        auditedAt: new Date(),
      })
      .returning();

    return NextResponse.json(inserted);
  });
}
