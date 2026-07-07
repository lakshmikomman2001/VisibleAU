import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, citationSourceIntelligence, subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const GROWTH_PLUS = ["growth", "agency", "agency_pro", "enterprise"];

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

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [sub] = await tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1);

    const tier = sub?.tier ?? "free";
    if (!GROWTH_PLUS.includes(tier)) {
      return NextResponse.json(
        { error: "Citation Source Intelligence requires Growth tier or above" },
        { status: 403 },
      );
    }

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

    const sources = await tx
      .select({
        id: citationSourceIntelligence.id,
        engine: citationSourceIntelligence.engine,
        sourceType: citationSourceIntelligence.sourceType,
        citationCount: citationSourceIntelligence.citationCount,
        citationShare: citationSourceIntelligence.citationShare,
        brandPresentInSource: citationSourceIntelligence.brandPresentInSource,
        gapSeverity: citationSourceIntelligence.gapSeverity,
        sourceAffinityNote: citationSourceIntelligence.sourceAffinityNote,
      })
      .from(citationSourceIntelligence)
      .where(eq(citationSourceIntelligence.brandId, brandId))
      .orderBy(desc(citationSourceIntelligence.calculatedAt))
      .limit(200);

    return NextResponse.json(
      sources.map((s) => ({
        ...s,
        citationShare: s.citationShare == null ? null : Number(s.citationShare),
      })),
    );
  });
}
