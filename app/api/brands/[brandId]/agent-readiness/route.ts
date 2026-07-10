import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withRlsContext } from "@/db/client";
import { brands, agentReadinessScores, llmstxtVersions } from "@/db/schema";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";

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

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
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

    const scores = await tx
      .select()
      .from(agentReadinessScores)
      .where(eq(agentReadinessScores.brandId, brandId))
      .orderBy(desc(agentReadinessScores.scoredAt))
      .limit(10);

    const latest = scores[0] ?? null;

    const [currentLlmstxt] = await tx
      .select({ depthScore: llmstxtVersions.depthScore })
      .from(llmstxtVersions)
      .where(and(eq(llmstxtVersions.brandId, brandId), eq(llmstxtVersions.isCurrent, true)))
      .limit(1);

    return NextResponse.json({
      latest,
      history: scores,
      llmstxtDepthScore: currentLlmstxt?.depthScore ?? null,
    });
  });
}
