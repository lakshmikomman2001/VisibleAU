import { and, count, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { audits, citations, engineCallFailures } from "@/db/schema";
import { getAnsweredCount } from "@/lib/audit/answered-count";
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

    // "The Running audit page shows made-up numbers" (23 Oct), item 2
    // -- answers received, the SAME "citations + engine_call_failures"
    // rule Part C's sample-audit status route uses, now one shared
    // implementation (lib/audit/answered-count.ts) instead of two.
    const { answeredCount } = await getAnsweredCount(tx, auditId);

    // mentionCount is specific to this route (the sample-audit status
    // route has no equivalent) -- kept as its own small query, run_number
    // = 1 only for the same reason getAnsweredCount's citation count is.
    const [{ mentionCount }] = await tx
      .select({
        mentionCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
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

    const perEngineFailures = await tx
      .select({
        engine: engineCallFailures.engine,
        failed: count(),
      })
      .from(engineCallFailures)
      .where(eq(engineCallFailures.auditId, auditId))
      .groupBy(engineCallFailures.engine);

    // "The Running audit page shows made-up numbers" (23 Oct), item 2
    // -- this used to default to 0 ("ChatGPT 8/0 - 0%" in production),
    // because audits.promptsCount wasn't written until completion (see
    // inngest/functions/run-audit.ts's record-prompt-count step, added
    // this same task). Still genuinely possible for a few seconds right
    // after an audit starts -- null here means "not known yet", and the
    // client (AuditRunningView) skips rendering a per-engine row rather
    // than showing a fabricated "/0".
    const perEngineTotal = audit.promptsCount;
    const engineProgress = (audit.engines ?? []).map((eng) => ({
      engine: eng,
      done:
        (perEngine.find((r) => r.engine === eng)?.done ?? 0) +
        (perEngineFailures.find((r) => r.engine === eng)?.failed ?? 0),
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
      answeredCount,
      mentionCount,
      engineProgress,
    });
  });
}
