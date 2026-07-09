import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withRlsContext } from "@/db/client";
import {
  agentReadinessScores,
  brands,
  contentStructureAudits,
  crawlerVisitLogs,
  llmstxtVersions,
} from "@/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const contentPages = await tx
      .select()
      .from(contentStructureAudits)
      .where(eq(contentStructureAudits.brandId, brandId))
      .limit(5);

    const recentVisits = await tx
      .select()
      .from(crawlerVisitLogs)
      .where(eq(crawlerVisitLogs.brandId, brandId))
      .orderBy(desc(crawlerVisitLogs.visitedAt))
      .limit(10);

    return NextResponse.json({
      agentReadiness: latestReadiness ?? null,
      llmstxt: currentLlmstxt ?? null,
      contentPages,
      recentVisits,
    });
  });
}
