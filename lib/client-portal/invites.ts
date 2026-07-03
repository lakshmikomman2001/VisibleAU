import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { clientPortalInvites } from "@/db/schema";

export async function generateInvite(
  organizationId: string,
  brandId: string,
  expiresInDays = 30,
  inviteeName?: string
): Promise<string> {
  const token = nanoid(32);
  await withRlsContext(organizationId, async (tx) => {
    await tx.insert(clientPortalInvites).values({
      organizationId,
      brandId,
      inviteToken: token,
      inviteeName: inviteeName ?? null,
      expiresAt: new Date(Date.now() + expiresInDays * 86_400_000),
      isRevoked: false,
    });
  });
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return `${baseUrl}/client-portal/${token}`;
}

export async function revokeInvite(
  organizationId: string,
  inviteId: string
): Promise<boolean> {
  const result = await withRlsContext(organizationId, async (tx) => {
    return tx
      .update(clientPortalInvites)
      .set({ isRevoked: true, revokedAt: new Date(), status: "revoked" })
      .where(
        and(
          eq(clientPortalInvites.id, inviteId),
          eq(clientPortalInvites.organizationId, organizationId)
        )
      );
  });
  return (result as any).rowCount > 0;
}
