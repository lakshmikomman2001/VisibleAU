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
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
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
    const rows = await tx.execute(sql`
      SELECT DISTINCT c.prompt
      FROM citations c
      JOIN audits a ON c.audit_id = a.id
      WHERE a.brand_id = ${brandId}
      ORDER BY c.prompt
      LIMIT 50
    `);

    return NextResponse.json({
      prompts: rows.map((r: Record<string, unknown>) => String(r.prompt)),
    });
  });
}
