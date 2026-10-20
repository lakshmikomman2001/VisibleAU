import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { audits, brands, citations } from "@/db/schema";
import { recomputeCitationPositions } from "@/lib/audit/recompute-citation-positions";
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

    // Vunnara Build 1, Part F.3: run_number = 1 only -- a historical
    // audit from before Part F.1 removed the replay loop can have up
    // to 5 rows per real (engine, prompt) call, which would otherwise
    // 5x-inflate domainCounts below and show the same cached
    // sampleMentions snippet repeated in perEngineSummary.
    const allCitations = await tx
      .select()
      .from(citations)
      .where(and(eq(citations.auditId, auditId), eq(citations.runNumber, 1)));

    const [brand] = await tx.select().from(brands).where(eq(brands.id, audit.brandId));
    // Vunnara (21 Oct, hotfix: "Usually #16") -- every `position` below
    // used to be the raw stored column (the same stale character-offset
    // heuristic as the audit page's own card). Recomputed once, bounded
    // to this one audit's already-fetched rows, never the stored column.
    const citationsWithRealPosition = brand
      ? await recomputeCitationPositions(allCitations, { name: brand.name, domain: brand.domain })
      : allCitations.map((c) => ({ ...c, realPosition: null as number | null }));

    const engines = audit.engines ?? [];
    const perEngineSummary = engines.map((engine) => {
      const engineCits = citationsWithRealPosition.filter((c) => c.engine === engine);
      const mentions = engineCits.filter((c) => c.brandMentioned);
      const positions = mentions.map((c) => c.realPosition).filter((p): p is number => p !== null);
      return {
        engine,
        mentionRate: engineCits.length > 0 ? mentions.length / engineCits.length : 0,
        avgPosition:
          positions.length > 0 ? positions.reduce((a, b) => a + b, 0) / positions.length : null,
        sentimentLabel: mentions[0]?.sentimentLabel ?? null,
        sampleMentions: mentions.slice(0, 3).map((c) => c.responseSnippet ?? ""),
      };
    });

    const domainCounts = new Map<string, number>();
    for (const cit of allCitations) {
      const sources = cit.citedSources as Array<{ domain: string }>;
      if (Array.isArray(sources)) {
        for (const s of sources) {
          domainCounts.set(s.domain, (domainCounts.get(s.domain) ?? 0) + 1);
        }
      }
    }
    const citedSourcesByDomain = [...domainCounts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count);

    // Task #46 (fix: stored value contradicting its own CI), follow-up
    // #2: recomputed live from real citations, never the stored score_*
    // columns -- same contract as every other rewired reader (see
    // lib/scoring/resolve-audit-dimensions.ts's doc comment). Sentiment/
    // Context have no real classifier behind them (Phase 3) -- exposed
    // as null rather than the old fabricated-from-mention-presence
    // numbers.
    const resolved =
      audit.status === "complete" ? await resolveAuditDimensionsAndHeadline(tx, auditId) : null;
    const scored = (d: { status: string; value?: number } | undefined) =>
      d?.status === "scored" ? (d.value ?? null) : null;
    // Vunnara (19 Oct, post-aa83b3a): scoreComposite is now the headline
    // -- the Frequency DimensionResult (mention rate), never a blend. Null
    // (with null CI) when there were zero organic answers (insufficient_
    // data "no_answers"), same as scorePosition/scoreAccuracy.
    const headline = resolved?.headline.status === "scored" ? resolved.headline : null;

    return NextResponse.json({
      audit: {
        id: audit.id,
        auditNumber: audit.auditNumber,
        status: audit.status,
        engines: audit.engines,
        engineCount: audit.engineCount,
        promptsCount: audit.promptsCount,
        runsPerPrompt: audit.runsPerPrompt,
        totalCalls: audit.totalCalls,
        totalCostUsd: audit.totalCostUsd,
        scoreComposite: headline?.value ?? null,
        scoreFrequency: scored(resolved?.dimensions.frequency),
        scorePosition: scored(resolved?.dimensions.position),
        scoreSentiment: null,
        scoreSentimentNumeric: null,
        scoreContext: null,
        scoreContextNumeric: null,
        scoreAccuracy: scored(resolved?.dimensions.accuracy),
        scoreConfidenceLow: headline?.ci.lower ?? null,
        scoreConfidenceHigh: headline?.ci.upper ?? null,
        confidenceIntervals: audit.confidenceIntervals,
        startedAt: audit.startedAt,
        completedAt: audit.completedAt,
        metadata: audit.metadata,
      },
      citations: citationsWithRealPosition.map((c) => ({
        id: c.id,
        engine: c.engine,
        prompt: c.prompt,
        runNumber: c.runNumber,
        brandMentioned: c.brandMentioned,
        position: c.realPosition,
        sentimentLabel: c.sentimentLabel,
        contextLabel: c.contextLabel,
        responseSnippet: c.responseSnippet,
        citedSources: c.citedSources,
        llmCostUsd: c.llmCostUsd,
        llmModel: c.llmModel,
      })),
      perEngineSummary,
      citedSourcesByDomain,
    });
  });
}
