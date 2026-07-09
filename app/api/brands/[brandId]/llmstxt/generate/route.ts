import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { crawlSite } from "@/lib/crawler";
import { generateLlmsTxt } from "@/lib/retrieval/llmstxt-generator";
import { serviceDb } from "@/db/client";
import { llmstxtVersions } from "@/db/schema";

export async function POST(
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
      .select({
        id: brands.id,
        domain: brands.domain,
        name: brands.name,
        organizationId: brands.organizationId,
      })
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.organizationId, currentUser.organizationId)));

    if (!brand) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const crawlResult = await crawlSite(brand.domain, {
      userAgent: "GPTBot/1.1",
      maxPages: 20,
    });

    const result = generateLlmsTxt(brand.name, brand.domain, crawlResult.pages, crawlResult.robotsTxt);

    await serviceDb.transaction(async (stx) => {
      await stx
        .update(llmstxtVersions)
        .set({ isCurrent: false })
        .where(
          and(
            eq(llmstxtVersions.brandId, brandId),
            eq(llmstxtVersions.isCurrent, true),
          ),
        );

      await stx.insert(llmstxtVersions).values({
        brandId,
        organizationId: brand.organizationId,
        content: result.content,
        depthScore: result.depthScore,
        isCurrent: true,
      });
    });

    return NextResponse.json({
      content: result.content,
      depthScore: result.depthScore,
    }, { status: 201 });
  });
}
