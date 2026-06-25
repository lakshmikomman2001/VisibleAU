import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { brands, bulkOperations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { inngest } from "@/lib/inngest/client";

const bulkReauditSchema = z.object({
  brandIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bulkReauditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { brandIds } = parsed.data;

  // Verify all brands belong to the org
  const orgBrands = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.organizationId, currentUser.organizationId));

  const orgBrandIds = new Set(orgBrands.map((b) => b.id));
  const invalidIds = brandIds.filter((id) => !orgBrandIds.has(id));

  if (invalidIds.length > 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Insert bulk operation record
  const [operation] = await db
    .insert(bulkOperations)
    .values({
      organizationId: currentUser.organizationId,
      operationType: "reaudit",
      totalBrands: brandIds.length,
      inputParams: { brandIds },
    })
    .returning();

  // Send Inngest event (non-blocking)
  await inngest
    .send({
      name: "bulk/reaudit.requested",
      data: {
        operationId: operation.id,
        organizationId: currentUser.organizationId,
        brandIds,
      },
    })
    .catch((err: unknown) =>
      console.error("[bulk-reaudit/POST] Inngest send failed", err),
    );

  return NextResponse.json({ operationId: operation.id }, { status: 202 });
}
