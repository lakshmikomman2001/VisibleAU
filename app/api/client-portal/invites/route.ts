import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, clientPortalInvites } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { generateInvite } from "@/lib/client-portal/invites";
import { roleRefusal, userCan } from "@/lib/governance";
import { planFeatureRefusal } from "@/lib/pricing/plan-features";

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

  // Sri, 8 Nov: sharing reports with a client is an owner's or admin's. The link's token is the client's
  // way in, so only a role that may make or revoke one is given it to copy.
  const mayShare = await userCan(currentUser, "manage_integrations");

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const rows = await tx
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
    const invites = rows.map((invite) => ({
      ...invite,
      inviteToken: mayShare ? invite.inviteToken : null,
    }));

    return NextResponse.json({ invites });
  });
}

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Making one is the paid part. Listing and revoking aren't: a workspace off the
  // plan can still see and shut down the links it already gave its clients.
  const refused = await planFeatureRefusal(currentUser.organizationId, "client_portal");
  if (refused) return refused;
  const forbidden = await roleRefusal(currentUser, "manage_integrations");
  if (forbidden) return forbidden;

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

  return withRlsContext(currentUser.organizationId, async (tx) => {
    // Verify brand belongs to org
    const [brand] = await tx
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
  });
}
