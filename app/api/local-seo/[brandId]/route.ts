import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, setRlsContext } from "@/db/client";
import { localSeoResults } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;

  const [result] = await db
    .select()
    .from(localSeoResults)
    .where(eq(localSeoResults.brandId, brandId))
    .orderBy(desc(localSeoResults.checkedAt))
    .limit(1);

  if (!result)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(result);
}
