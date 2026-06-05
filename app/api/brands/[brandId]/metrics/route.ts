import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [brand] = await db
    .select()
    .from(brands)
    .where(
      and(
        eq(brands.id, brandId),
        eq(brands.organizationId, currentUser.organizationId),
        isNull(brands.deletedAt),
      ),
    );
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recentAudits = await db
    .select({
      id: audits.id,
      compositeScore: audits.scoreComposite,
      completedAt: audits.completedAt,
    })
    .from(audits)
    .where(and(eq(audits.brandId, brandId), eq(audits.status, "complete")))
    .orderBy(desc(audits.completedAt))
    .limit(20);

  const lastScore = recentAudits[0]?.compositeScore
    ? Number.parseFloat(recentAudits[0].compositeScore)
    : 0;
  const priorScore = recentAudits[1]?.compositeScore
    ? Number.parseFloat(recentAudits[1].compositeScore)
    : lastScore;
  const change = lastScore - priorScore;
  const trend = change > 2 ? "up" : change < -2 ? "down" : "flat";

  return NextResponse.json({
    audits: recentAudits.map((a) => ({
      id: a.id,
      compositeScore: a.compositeScore ? Number.parseFloat(a.compositeScore) : null,
      completedAt: a.completedAt,
    })),
    trend,
    lastAuditScore: lastScore,
    changeVsPriorAudit: change,
  });
}
