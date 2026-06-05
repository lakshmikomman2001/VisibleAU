import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import type { Brand } from "@/db/schema";
import { verticalPackPrompts, verticalPacks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { expandPrompt } from "@/lib/verticals/expand-prompt";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: packId } = await params;
  const { searchParams } = new URL(req.url);

  const pack = await db.query.verticalPacks.findFirst({
    where: and(eq(verticalPacks.id, packId), isNull(verticalPacks.retiredAt)),
  });
  if (!pack) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  const brandName = searchParams.get("brandName") ?? "your brand";
  const rawRegion = searchParams.get("primaryRegion") ?? "";
  const locations = rawRegion ? [rawRegion] : [];

  const promptRows = await db
    .select()
    .from(verticalPackPrompts)
    .where(eq(verticalPackPrompts.packId, packId))
    .orderBy(asc(verticalPackPrompts.rank))
    .limit(10);

  const expanded = promptRows
    .flatMap((p) =>
      expandPrompt(p.promptTemplate, {
        brand: { name: brandName, domain: "" } as Brand,
        competitors: [],
        locations,
      }),
    )
    .slice(0, 3);

  return NextResponse.json({ expandedPrompts: expanded });
}
