import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { serviceDb } from "@/db/client";
import { orgMembers, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canPerformAction, getMemberRecord, recordAction } from "@/lib/governance";
import type { OrgRole } from "@/lib/governance";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "analyst", "viewer"]).default("viewer"),
  brandAccess: z.array(z.string().uuid()).nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [targetUser] = await serviceDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email));

  if (!targetUser)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const token = nanoid(21);

  const [invited] = await serviceDb
    .insert(orgMembers)
    .values({
      organizationId: currentUser.organizationId,
      userId: targetUser.id,
      role: parsed.data.role,
      brandAccess: parsed.data.brandAccess ?? null,
      invitedBy: currentUser.id,
      invitedAt: new Date(),
      invitationToken: token,
      isActive: false,
    })
    .onConflictDoNothing()
    .returning();

  if (!invited)
    return NextResponse.json({ error: "Member already exists" }, { status: 409 });

  await recordAction({
    organizationId: currentUser.organizationId,
    userId: currentUser.id,
    action: "member_invited",
    resourceType: "org_member",
    resourceId: invited.id,
    metadata: { email: parsed.data.email, role: parsed.data.role },
  });

  return NextResponse.json({ id: invited.id, token }, { status: 201 });
}
