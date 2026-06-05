import { and, count, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { audits, citations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(_req: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setRlsContext(db, currentUser.organizationId);

  const { auditId } = await params;
  if (!z.string().uuid().safeParse(auditId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [audit] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.id, auditId), eq(audits.organizationId, currentUser.organizationId)));
  if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [citStats] = await db
    .select({
      total: count(),
      mentions: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
    })
    .from(citations)
    .where(eq(citations.auditId, auditId));

  return NextResponse.json({
    audit: {
      id: audit.id,
      auditNumber: audit.auditNumber,
      status: audit.status,
      scoreComposite: audit.scoreComposite,
      totalCostUsd: audit.totalCostUsd,
      promptsCount: audit.promptsCount,
      runsPerPrompt: audit.runsPerPrompt,
      totalCalls: audit.totalCalls,
      engines: audit.engines,
      startedAt: audit.startedAt,
      completedAt: audit.completedAt,
      metadata: audit.metadata,
    },
    citationCount: citStats.total,
    mentionCount: citStats.mentions,
  });
}
