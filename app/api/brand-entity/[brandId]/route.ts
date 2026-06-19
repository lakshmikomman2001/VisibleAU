import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, setRlsContext } from "@/db/client";
import { brandEntityScores, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  if (!isUuid(brandId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [brand] = await db
    .select()
    .from(brands)
    .where(
      and(
        eq(brands.id, brandId),
        eq(brands.organizationId, currentUser.organizationId),
        isNull(brands.deletedAt),
      ),
    );
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [latest] = await db
    .select()
    .from(brandEntityScores)
    .where(eq(brandEntityScores.brandId, brandId))
    .orderBy(desc(brandEntityScores.checkedAt))
    .limit(1);

  if (!latest) return NextResponse.json({ error: "No entity score found" }, { status: 404 });

  return NextResponse.json(latest);
}
