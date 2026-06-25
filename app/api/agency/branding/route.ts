import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { agencyBrandAssets } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const upsertSchema = z.object({
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().max(20).optional(),
  secondaryColor: z.string().max(20).optional(),
  accentColor: z.string().max(20).optional(),
  footerText: z.string().max(500).optional(),
  contactLine: z.string().max(200).optional(),
  agencyName: z.string().max(100).optional(),
  contactEmail: z.string().email().optional(),
});

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const [branding] = await db
    .select()
    .from(agencyBrandAssets)
    .where(
      and(
        eq(agencyBrandAssets.organizationId, currentUser.organizationId),
        isNull(agencyBrandAssets.brandId),
      ),
    );

  return NextResponse.json({ branding: branding ?? null });
}

export async function PATCH(req: Request) {
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

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [branding] = await db
    .insert(agencyBrandAssets)
    .values({
      organizationId: currentUser.organizationId,
      brandId: null,
      ...parsed.data,
    })
    .onConflictDoUpdate({
      target: [agencyBrandAssets.organizationId, agencyBrandAssets.brandId],
      set: {
        ...parsed.data,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ branding });
}
