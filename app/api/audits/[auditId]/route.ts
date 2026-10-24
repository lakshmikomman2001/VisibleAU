import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { audits, citations, engineCallFailures } from "@/db/schema";
import { getAnsweredCount, getCostSoFarUsd } from "@/lib/audit/answered-count";
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

    // "Before pushing e53edf2" (24 Oct), item 1 -- "Cost so far" is a
    // real-time sum of each (engine, prompt) call's own already-
    // measured cost, never a projection (lib/audit/answered-count.ts's
    // own doc comment on getCostSoFarUsd has the full reasoning).
    const costSoFarUsd = await getCostSoFarUsd(tx, auditId);

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

    // "Before pushing e53edf2" (24 Oct), items 2-3 -- mentionedCount/
    // sampleCount/medianPosition/rankedCount are now read from the SAME
    // function the finished page's own "Mentioned in k of n answers"
    // and "Typically #N when listed" come from
    // (lib/scoring/resolve-audit-dimensions.ts), not a second,
    // separately-maintained query -- a finished audit's last running
    // figure is now guaranteed to equal the finished page's own k/N.
    // Safe to call unconditionally (not just once complete): an audit
    // with literally zero organic citations yet gets an explicit
    // insufficient_data/zero result from that function itself, never a
    // crash or a fabricated number. Vunnara (19 Oct, post-aa83b3a): the
    // headline is the Frequency DimensionResult (mention rate), never a
    // blend.
    const { headline, sampleCount, mentionedCount, medianPosition, rankedCount } =
      await resolveAuditDimensionsAndHeadline(tx, auditId);
    // scoreComposite itself is still only ever shown once the audit is
    // actually complete -- unchanged from before this task.
    const scoreComposite =
      audit.status === "complete" && headline.status === "scored" ? headline.value : null;

    return NextResponse.json({
      audit: {
        id: audit.id,
        auditNumber: audit.auditNumber,
        status: audit.status,
        scoreComposite,
        promptsCount: audit.promptsCount,
        runsPerPrompt: audit.runsPerPrompt,
        totalCalls: audit.totalCalls,
        engines: audit.engines,
        startedAt: audit.startedAt,
        completedAt: audit.completedAt,
        metadata: audit.metadata,
      },
      answeredCount,
      costSoFarUsd,
      sampleCount,
      mentionedCount,
      medianPosition,
      rankedCount,
      engineProgress,
    });
  });
}
