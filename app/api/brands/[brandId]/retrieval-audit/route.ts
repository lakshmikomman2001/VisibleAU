import { and, count, desc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import {
  agentReadinessScores,
  brands,
  contentStructureAudits,
  crawlerVisitLogs,
  llmstxtVersions,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, brandAccessErrorResponse } from "@/lib/governance";
import { readinessFromStoredRow } from "@/lib/retrieval/agent-readiness-breakdown";

/** The period the hub's crawler visit count covers. */
const CRAWLER_VISIT_DAYS = 30;

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.organizationId, currentUser.organizationId)));

    if (!brand) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [latestReadiness] = await tx
      .select()
      .from(agentReadinessScores)
      .where(eq(agentReadinessScores.brandId, brandId))
      .orderBy(desc(agentReadinessScores.scoredAt))
      .limit(1);

    const [currentLlmstxt] = await tx
      .select()
      .from(llmstxtVersions)
      .where(and(eq(llmstxtVersions.brandId, brandId), eq(llmstxtVersions.isCurrent, true)))
      .limit(1);

    // 17 Nov, part 3: "Avg Citation Prob." averaged 5 rows picked with no ORDER BY. content_structure_audits
    // holds one row per page (unique brand_id + page_url, updated on each check), so every row is a page's latest
    // check: the average is over all of them, and the page says how many and when they were last checked.
    const contentPages = await tx
      .select({
        pageUrl: contentStructureAudits.pageUrl,
        citationProbabilityScore: contentStructureAudits.citationProbabilityScore,
        auditedAt: contentStructureAudits.auditedAt,
      })
      .from(contentStructureAudits)
      .where(eq(contentStructureAudits.brandId, brandId))
      .orderBy(desc(contentStructureAudits.auditedAt));

    // "Crawler Visits" was the length of a 10-row list, so it could never pass 10. It's a count over a stated
    // period now.
    const since = new Date(Date.now() - CRAWLER_VISIT_DAYS * 24 * 60 * 60 * 1000);
    const [visits] = await tx
      .select({ total: count() })
      .from(crawlerVisitLogs)
      .where(and(eq(crawlerVisitLogs.brandId, brandId), gte(crawlerVisitLogs.visitedAt, since)));

    return NextResponse.json({
      agentReadiness: latestReadiness ?? null,
      // The score from its measured parts only (lib/retrieval/agent-readiness-breakdown.ts).
      agentReadinessMeasured: latestReadiness
        ? readinessFromStoredRow(latestReadiness).total
        : null,
      llmstxt: currentLlmstxt ?? null,
      contentPages,
      crawlerVisits: { count: visits?.total ?? 0, days: CRAWLER_VISIT_DAYS },
    });
  });
}
