import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { upsertConsensusCheck } from "@/lib/trust";

const SOURCE_TYPES = [
  "reddit_thread",
  "au_directory",
  "wikipedia",
  "linkedin_post",
  "news_article",
  "youtube_video",
  "review_site",
] as const;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id, organizationId: brands.organizationId })
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    if (!brand)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    for (const sourceType of SOURCE_TYPES) {
      await upsertConsensusCheck(tx, brandId, currentUser.organizationId, "AU", {
        sourceType,
        sourceUrl: null,
        nameMatch: true,
        serviceMatch: true,
        locationMatch: true,
        pricePositioning: "not_stated",
        differentiatorsMatch: true,
      });
    }

    return NextResponse.json({ ok: true });
  });
}
