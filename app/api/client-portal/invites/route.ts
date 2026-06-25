import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { clientPortalInvites, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { generateInvite } from "@/lib/client-portal/invites";

const createInviteSchema = z.object({
  brandId: z.string().uuid(),
  inviteeName: z.string().max(100).optional(),
  expiresInDays: z.number().int().min(1).max(90).optional().default(7),
});

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const invites = await db
    .select({
      id: clientPortalInvites.id,
      brandId: clientPortalInvites.brandId,
      brandName: brands.name,
      inviteToken: clientPortalInvites.inviteToken,
      inviteeName: clientPortalInvites.inviteeName,
      status: clientPortalInvites.status,
      expiresAt: clientPortalInvites.expiresAt,
      isRevoked: clientPortalInvites.isRevoked,
      createdAt: clientPortalInvites.createdAt,
    })
    .from(clientPortalInvites)
    .innerJoin(brands, eq(clientPortalInvites.brandId, brands.id))
    .where(eq(clientPortalInvites.organizationId, currentUser.organizationId));

  return NextResponse.json({ invites });
}

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

  const parsed = createInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Verify brand belongs to org
  const [brand] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.id, parsed.data.brandId));

  if (!brand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const inviteUrl = await generateInvite(
    currentUser.organizationId,
    parsed.data.brandId,
    parsed.data.expiresInDays,
    parsed.data.inviteeName,
  );

  return NextResponse.json({ inviteUrl }, { status: 201 });
}
