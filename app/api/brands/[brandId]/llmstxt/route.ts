import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withRlsContext } from "@/db/client";
import { brands, llmstxtVersions } from "@/db/schema";

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

    const versions = await tx
      .select()
      .from(llmstxtVersions)
      .where(eq(llmstxtVersions.brandId, brandId))
      .orderBy(desc(llmstxtVersions.generatedAt))
      .limit(10);

    const current = versions.find((v) => v.isCurrent) ?? null;

    return NextResponse.json({ current, history: versions });
  });
}
