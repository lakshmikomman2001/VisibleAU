import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { checkCrawlerAccess } from "@/lib/crawler/crawler-access";
import { assertBrandAccess, brandAccessErrorResponse } from "@/lib/governance";

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

  const brand = await withRlsContext(currentUser.organizationId, async (tx) => {
    const [row] = await tx
      .select({ id: brands.id, domain: brands.domain })
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.organizationId, currentUser.organizationId)));
    return row;
  });
  if (!brand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2: this sent one request as GPTBot and said the CDN blocks
  // AI crawlers on a 403. It reads robots.txt and the home page as us now, and says what that shows and what
  // can't be tested from outside (lib/crawler/crawler-access.ts). Outside the transaction: two site requests.
  return NextResponse.json(await checkCrawlerAccess(brand.domain));
}
