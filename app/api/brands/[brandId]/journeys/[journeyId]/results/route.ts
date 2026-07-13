import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, journeyRunResults } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, assertTier, BrandAccessDeniedError, TierInsufficientError } from "@/lib/governance";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string; journeyId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId, journeyId } = await params;
  if (!z.string().uuid().safeParse(brandId).success || !z.string().uuid().safeParse(journeyId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, "agency");
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
    if (!brand)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const results = await tx
      .select()
      .from(journeyRunResults)
      .where(eq(journeyRunResults.journeyId, journeyId))
      .orderBy(desc(journeyRunResults.runAt))
      .limit(100);

    return NextResponse.json(
      results.map((r) => ({
        ...r,
        journeyScore: r.journeyScore == null ? null : Number(r.journeyScore),
      })),
    );
  });
}
