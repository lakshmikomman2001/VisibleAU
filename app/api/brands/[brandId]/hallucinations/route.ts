import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, hallucinationIncidents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

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

    const incidents = await tx
      .select({
        id: hallucinationIncidents.id,
        engine: hallucinationIncidents.engine,
        claimType: hallucinationIncidents.claimType,
        severity: hallucinationIncidents.severity,
        incorrectClaim: hallucinationIncidents.incorrectClaim,
        correctValue: hallucinationIncidents.correctValue,
        isAcknowledged: hallucinationIncidents.isAcknowledged,
        isFalsePositive: hallucinationIncidents.isFalsePositive,
        createdAt: hallucinationIncidents.createdAt,
      })
      .from(hallucinationIncidents)
      .where(eq(hallucinationIncidents.brandId, brandId))
      .orderBy(desc(hallucinationIncidents.createdAt))
      .limit(200);

    return NextResponse.json(incidents);
  });
}
