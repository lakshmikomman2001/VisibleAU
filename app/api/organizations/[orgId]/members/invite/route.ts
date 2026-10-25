import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { serviceDb, withRlsContext } from "@/db/client";
import { orgMembers, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { appUrl } from "@/lib/email/links";
import { sendEmail } from "@/lib/email/send";
import { teamInviteEmail } from "@/lib/email/templates/auth";
import type { OrgRole } from "@/lib/governance";
import { canPerformAction, getMemberRecord, recordAction } from "@/lib/governance";
import { checkPostgresRateLimit } from "@/lib/governance/pg-rate-limit";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "analyst", "viewer"]).default("viewer"),
  brandAccess: z.array(z.string().uuid()).nullable().optional(),
});

/** Invitations (new or re-sent) to one address, per org, per hour. */
export const INVITE_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 } as const;

/**
 * Creates an invitation and emails it (Task 15) -- or, when the person
 * already has a pending one, re-sends it: same request, a fresh link and
 * a fresh 7-day window. Rate-limited per org and address either way.
 * The email failing doesn't undo the invite; the response says whether
 * it went (emailSent), so the team page can tell the inviter.
 */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (orgId !== currentUser.organizationId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const member = await getMemberRecord(currentUser.organizationId, currentUser.id);
  const role: OrgRole = (member?.role ?? currentUser.role ?? "viewer") as OrgRole;
  if (!canPerformAction(role, "invite_members"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const limit = await checkPostgresRateLimit({
    routeKey: "team-invite",
    // Hashed before it's stored (pg-rate-limit.ts's hashIp).
    ip: `${currentUser.organizationId}:${parsed.data.email.trim().toLowerCase()}`,
    ...INVITE_LIMIT,
  });
  if (!limit.allowed)
    return NextResponse.json(
      { error: "Too many invitations to this address. Try again in an hour." },
      { status: 429 },
    );

  const [targetUser] = await serviceDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email));

  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const token = nanoid(21);
  const invitedAt = new Date();
  // Task #46 (15th follow-up): 7-day window, enforced by
  // members/accept/route.ts (`expires_at > now()`) -- see migration 0042.
  const expiresAt = new Date(invitedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [invited] = await serviceDb
    .insert(orgMembers)
    .values({
      organizationId: currentUser.organizationId,
      userId: targetUser.id,
      role: parsed.data.role,
      brandAccess: parsed.data.brandAccess ?? null,
      invitedBy: currentUser.id,
      invitedAt,
      expiresAt,
      invitationToken: token,
      isActive: false,
    })
    .onConflictDoNothing()
    .returning();

  let invite = invited;
  let resent = false;
  if (!invite) {
    // Already in the org: a member (409, as before), or a pending
    // invite, which is re-sent with a fresh link and window.
    const [refreshed] = await withRlsContext(currentUser.organizationId, (tx) =>
      tx
        .update(orgMembers)
        .set({
          role: parsed.data.role,
          brandAccess: parsed.data.brandAccess ?? null,
          invitedBy: currentUser.id,
          invitedAt,
          expiresAt,
          invitationToken: token,
          updatedAt: invitedAt,
        })
        .where(
          and(
            eq(orgMembers.organizationId, currentUser.organizationId),
            eq(orgMembers.userId, targetUser.id),
            isNull(orgMembers.acceptedAt),
          ),
        )
        .returning(),
    );
    if (!refreshed) return NextResponse.json({ error: "Member already exists" }, { status: 409 });
    invite = refreshed;
    resent = true;
  }

  await recordAction({
    organizationId: currentUser.organizationId,
    userId: currentUser.id,
    action: "member_invited",
    resourceType: "org_member",
    resourceId: invite.id,
    metadata: { email: parsed.data.email, role: parsed.data.role, ...(resent ? { resent } : {}) },
  });

  const sent = await sendEmail({
    to: parsed.data.email,
    ...teamInviteEmail({
      inviterName: currentUser.name || currentUser.email,
      orgName: currentUser.organization.name,
      role: parsed.data.role,
      // Org and token in the path: sign-in's redirect keeps the path only.
      acceptUrl: appUrl(`/invite/${currentUser.organizationId}/${token}`),
      expiresAt,
      organizationId: currentUser.organizationId,
    }),
    category: "team_invite",
    organizationId: currentUser.organizationId,
  });

  return NextResponse.json(
    { id: invite.id, token, resent, emailSent: sent.ok },
    { status: resent ? 200 : 201 },
  );
}
