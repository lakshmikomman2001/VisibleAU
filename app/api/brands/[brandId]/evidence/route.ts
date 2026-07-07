import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, evidenceSnapshots, subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const AGENCY_PLUS = ["agency", "agency_pro", "enterprise"];

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
    if (!AGENCY_PLUS.includes(tier)) {
      return NextResponse.json(
        { error: "Evidence Archive requires Agency tier or above" },
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

    const snapshots = await tx
      .select({
        id: evidenceSnapshots.id,
        engine: evidenceSnapshots.engine,
        prompt: evidenceSnapshots.prompt,
        rawResponse: evidenceSnapshots.rawResponse,
        scoreAtCapture: evidenceSnapshots.scoreAtCapture,
        capturedAt: evidenceSnapshots.capturedAt,
      })
      .from(evidenceSnapshots)
      .where(eq(evidenceSnapshots.brandId, brandId))
      .orderBy(desc(evidenceSnapshots.capturedAt))
      .limit(200);

    return NextResponse.json(
      snapshots.map((s) => ({
        ...s,
        scoreAtCapture: s.scoreAtCapture == null ? null : Number(s.scoreAtCapture),
      })),
    );
  });
}
