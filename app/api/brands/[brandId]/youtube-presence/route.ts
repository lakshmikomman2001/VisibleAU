import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, youtubePresenceAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { ExplainabilityService } from "@/lib/platform/explainability";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
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
    if (!brand)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [latest] = await tx
      .select()
      .from(youtubePresenceAudits)
      .where(eq(youtubePresenceAudits.brandId, brandId))
      .orderBy(desc(youtubePresenceAudits.auditedAt))
      .limit(1);

    if (!latest) return NextResponse.json(null);

    const annotation = ExplainabilityService.annotate({
      score: latest.presenceScore ?? 0,
      scoreLabel: "YouTube Presence",
      maxScore: 100,
      context: { brandName: brand.name, dimension: "YouTube presence" },
      topAction:
        latest.gaps && Array.isArray(latest.gaps) && latest.gaps.length > 0
          ? String(latest.gaps[0])
          : undefined,
    });

    const ps = latest.presenceScore ?? 0;
    const scoreLevel: "Low" | "Medium" | "High" =
      ps <= 33 ? "Low" : ps <= 66 ? "Medium" : "High";

    return NextResponse.json({ ...latest, ...annotation, scoreLevel });
  });
}
