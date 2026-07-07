import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { hallucinationIncidents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const patchSchema = z.object({
  isAcknowledged: z.boolean().optional(),
  isFalsePositive: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ brandId: string; id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId, id } = await params;
  if (
    !z.string().uuid().safeParse(brandId).success ||
    !z.string().uuid().safeParse(id).success
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [existing] = await tx
      .select({ id: hallucinationIncidents.id })
      .from(hallucinationIncidents)
      .where(
        and(
          eq(hallucinationIncidents.id, id),
          eq(hallucinationIncidents.brandId, brandId),
          eq(
            hallucinationIncidents.organizationId,
            currentUser.organizationId,
          ),
        ),
      );
    if (!existing)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.isAcknowledged) {
      updates.isAcknowledged = true;
      updates.acknowledgedAt = new Date();
      updates.acknowledgedBy = currentUser.id;
    }
    if (parsed.data.isFalsePositive) {
      updates.isFalsePositive = true;
    }

    const [updated] = await tx
      .update(hallucinationIncidents)
      .set(updates)
      .where(eq(hallucinationIncidents.id, id))
      .returning();

    return NextResponse.json(updated);
  });
}
