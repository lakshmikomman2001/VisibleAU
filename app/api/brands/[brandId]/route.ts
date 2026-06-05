import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";

const updateBrandSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  domain: z.string().min(1).max(253).optional(),
  vertical: z.enum(["tradies", "allied_health", "saas"]).optional(),
  competitors: z.array(z.string()).optional(),
  primaryRegions: z
    .array(
      z
        .string()
        .regex(
          /^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/,
          "Format: STATE:Suburb (e.g. NSW:Bondi, VIC:Fitzroy)",
        ),
    )
    .optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const brand = await getBrandForOrg(brandId, currentUser.organizationId);
  if (!brand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ brand });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await getBrandForOrg(brandId, currentUser.organizationId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateBrandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(brands)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(brands.id, brandId))
    .returning();

  return NextResponse.json({ brand: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await getBrandForOrg(brandId, currentUser.organizationId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .update(brands)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(brands.id, brandId));

  return new NextResponse(null, { status: 204 });
}
