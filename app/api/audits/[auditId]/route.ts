import { and, count, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { audits, citations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";

export async function GET(_req: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { auditId } = await params;
  if (!z.string().uuid().safeParse(auditId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [audit] = await tx
      .select()
      .from(audits)
      .where(and(eq(audits.id, auditId), eq(audits.organizationId, currentUser.organizationId)));
    if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Vunnara Build 1, Part F.3: run_number = 1 only -- for a brand-new
    // audit (runsPerPrompt=1 since Part F.1) this is already every
    // row, but a legacy audit still in flight at deploy time could
    // write up to 5 rows per real call; keep this progress endpoint
    // counting real calls, not replays.
    const [citStats] = await tx
      .select({
        total: count(),
        mentions: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
      })
      .from(citations)
      .where(and(eq(citations.auditId, auditId), eq(citations.runNumber, 1)));

    const perEngine = await tx
      .select({
        engine: citations.engine,
        done: count(),
      })
      .from(citations)
      .where(and(eq(citations.auditId, auditId), eq(citations.runNumber, 1)))
      .groupBy(citations.engine);

    const perEngineTotal = audit.promptsCount ?? 0;
    const engineProgress = (audit.engines ?? []).map((eng) => ({
      engine: eng,
      done: perEngine.find((r) => r.engine === eng)?.done ?? 0,
      total: perEngineTotal,
    }));

    // Task #46 (fix: stored value contradicting its own CI), follow-up
    // #2: this route is polled repeatedly while an audit runs -- only
    // recompute the headline once there's actually a completed audit
    // to recompute from (a single-audit call is cheap; skipping it for
    // every pending/running poll avoids doing that work when the result
    // would just be null anyway). Vunnara (19 Oct, post-aa83b3a): the
    // headline is the Frequency DimensionResult (mention rate), never a
    // blend -- null too when there were zero organic answers
    // (insufficient_data "no_answers"), never a fabricated 0.
    const headline =
      audit.status === "complete"
        ? (await resolveAuditDimensionsAndHeadline(tx, auditId)).headline
        : null;
    const scoreComposite = headline?.status === "scored" ? headline.value : null;

    return NextResponse.json({
      audit: {
        id: audit.id,
        auditNumber: audit.auditNumber,
        status: audit.status,
        scoreComposite,
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
      engineProgress,
    });
  });
}
