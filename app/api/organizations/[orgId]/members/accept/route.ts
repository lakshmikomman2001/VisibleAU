import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { serviceDb } from "@/db/client";
import { orgMembers } from "@/db/schema";

// Task #46 (14th follow-up): serviceDb audit (MEDIUM). This route has no
// session/auth check at all -- by design, since invitation-accept links are
// clicked pre-login. org-id scoping IS enforced: `member.organizationId !==
// orgId` (:22) means the invitation token can never activate membership in
// a DIFFERENT org than the one the token/URL claims -- no cross-org
// escalation is possible via this route. What's NOT checked: (1) there is
// no `expiresAt`/TTL check anywhere in this file, despite the error message
// implying one ("Invalid or expired invitation") -- contrast with
// client-portal-invites, which does check expiry; (2) nothing confirms the
// caller IS the invited person (`orgMembers.userId`, set at invite time) --
// anyone who has the raw token string (forwarded email, browser history,
// server log, screenshot) can activate that specific membership, indefinitely,
// without ever proving they're that person. Recommend adding an expiry
// check and requiring the caller to be authenticated as the invited user
// (or at minimum the invited email) before activating -- flagged for Sri,
// not fixed here (this follow-up only requires Highs to be fixed).
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token || token.length < 10)
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const [member] = await serviceDb
    .select()
    .from(orgMembers)
    .where(eq(orgMembers.invitationToken, token));

  if (!member || member.organizationId !== orgId)
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });

  if (member.acceptedAt)
    return NextResponse.json({ error: "Invitation already accepted" }, { status: 409 });

  const [updated] = await serviceDb
    .update(orgMembers)
    .set({
      acceptedAt: new Date(),
      isActive: true,
      invitationToken: null,
      updatedAt: new Date(),
    })
    .where(eq(orgMembers.id, member.id))
    .returning();

  return NextResponse.json({ accepted: true, memberId: updated.id });
}
