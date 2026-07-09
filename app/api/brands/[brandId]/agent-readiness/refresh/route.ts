import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";

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
      .select({ id: brands.id, organizationId: brands.organizationId })
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.organizationId, currentUser.organizationId)));

    if (!brand) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await inngest.send({
      name: "technical-audit/complete",
      data: {
        brandId: brand.id,
        organizationId: brand.organizationId,
      },
    });

    return NextResponse.json({ status: "triggered" }, { status: 202 });
  });
}
