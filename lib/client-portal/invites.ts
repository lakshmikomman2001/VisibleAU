import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clientPortalInvites } from "@/db/schema";
import { setRlsContext } from "@/db/client";

export async function generateInvite(
  organizationId: string,
  brandId: string,
  expiresInDays = 30,
  inviteeName?: string
): Promise<string> {
  const token = nanoid(32);
  await setRlsContext(db, organizationId);
  await db.insert(clientPortalInvites).values({
    organizationId,
    brandId,
    inviteToken: token,
    inviteeName: inviteeName ?? null,
    expiresAt: new Date(Date.now() + expiresInDays * 86_400_000),
    isRevoked: false,
  });
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return `${baseUrl}/client-portal/${token}`;
}

export async function revokeInvite(
  organizationId: string,
  inviteId: string
): Promise<boolean> {
  await setRlsContext(db, organizationId);
  const result = await db
    .update(clientPortalInvites)
    .set({ isRevoked: true, revokedAt: new Date(), status: "revoked" })
    .where(
      and(
        eq(clientPortalInvites.id, inviteId),
        eq(clientPortalInvites.organizationId, organizationId)
      )
    );
  return (result as any).rowCount > 0;
}
