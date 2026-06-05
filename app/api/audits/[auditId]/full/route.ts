import { and, eq } from "drizzle-orm";
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

  const allCitations = await db.select().from(citations).where(eq(citations.auditId, auditId));

  const engines = audit.engines ?? [];
  const perEngineSummary = engines.map((engine) => {
    const engineCits = allCitations.filter((c) => c.engine === engine);
    const mentions = engineCits.filter((c) => c.brandMentioned);
    const positions = mentions.map((c) => c.position).filter((p): p is number => p !== null);
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
      scoreComposite: audit.scoreComposite,
      scoreFrequency: audit.scoreFrequency,
      scorePosition: audit.scorePosition,
      scoreSentiment: audit.scoreSentiment,
      scoreSentimentNumeric: audit.scoreSentimentNumeric,
      scoreContext: audit.scoreContext,
      scoreContextNumeric: audit.scoreContextNumeric,
      scoreAccuracy: audit.scoreAccuracy,
      scoreConfidenceLow: audit.scoreConfidenceLow,
      scoreConfidenceHigh: audit.scoreConfidenceHigh,
      confidenceIntervals: audit.confidenceIntervals,
      startedAt: audit.startedAt,
      completedAt: audit.completedAt,
      metadata: audit.metadata,
    },
    citations: allCitations.map((c) => ({
      id: c.id,
      engine: c.engine,
      prompt: c.prompt,
      runNumber: c.runNumber,
      brandMentioned: c.brandMentioned,
      position: c.position,
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
}
