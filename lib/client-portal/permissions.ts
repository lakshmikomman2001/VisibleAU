import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clientPortalInvites } from "@/db/schema";

export async function isValidPortalToken(
  token: string,
  brandId: string
): Promise<boolean> {
  const [invite] = await db
    .select({
      isRevoked: clientPortalInvites.isRevoked,
      expiresAt: clientPortalInvites.expiresAt,
      brandId: clientPortalInvites.brandId,
    })
    .from(clientPortalInvites)
    .where(
      and(
        eq(clientPortalInvites.inviteToken, token),
        eq(clientPortalInvites.brandId, brandId)
      )
    );
  if (!invite) return false;
  if (invite.isRevoked) return false;
  if (invite.expiresAt && invite.expiresAt < new Date()) return false;
  return true;
}
