import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { isTierAtLeast } from "@/lib/brands";

const uuidSchema = z.string().uuid();

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string; promptId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId, promptId } = await params;
  if (!uuidSchema.safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [sub] = await withRlsContext(currentUser.organizationId, (tx) =>
    tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1),
  );
  const tier = sub?.tier ?? "free";
  if (!isTierAtLeast(tier, "growth"))
    return NextResponse.json({ error: "Growth plan required" }, { status: 403 });

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    // v8.16 JOIN: citations has NO brand_id — filter via audits.brand_id
    const rows = await tx.execute(sql`
      SELECT
        DATE_TRUNC('week', c.created_at) AS week,
        COUNT(CASE WHEN c.brand_mentioned THEN 1 END)::float
          / NULLIF(COUNT(*), 0) AS mention_rate
      FROM citations c
      JOIN audits a ON c.audit_id = a.id
      WHERE a.brand_id = ${brandId}
        AND c.prompt = ${decodeURIComponent(promptId)}
        AND c.created_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', c.created_at)
      ORDER BY week
    `);

    if (rows.length < 2)
      return NextResponse.json({ trend: [], message: "Not enough history yet" });

    return NextResponse.json({
      trend: rows.map((r: Record<string, unknown>) => ({
        week: r.week,
        mentionRate: Number(r.mention_rate) || 0,
      })),
    });
  });
}
