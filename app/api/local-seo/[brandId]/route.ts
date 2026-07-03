import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { localSeoResults } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const brand = await getBrandForOrg(brandId, currentUser.organizationId, tx);
    if (!brand) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [result] = await tx
      .select()
      .from(localSeoResults)
      .where(eq(localSeoResults.brandId, brandId))
      .orderBy(desc(localSeoResults.checkedAt))
      .limit(1);

    if (!result)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(result);
  });
}
