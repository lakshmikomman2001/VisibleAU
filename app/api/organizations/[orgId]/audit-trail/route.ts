import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { auditTrail, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canPerformAction, getMemberRecord } from "@/lib/governance";
import type { OrgRole } from "@/lib/governance";

export async function GET(
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
  if (!canPerformAction(role, "view_audit_trail"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));
  const offset = (page - 1) * limit;

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const rows = await tx
      .select({
        id: auditTrail.id,
        action: auditTrail.action,
        resourceType: auditTrail.resourceType,
        resourceId: auditTrail.resourceId,
        metadata: auditTrail.metadata,
        createdAt: auditTrail.createdAt,
        userId: auditTrail.userId,
        userName: users.name,
        userEmail: users.email,
      })
      .from(auditTrail)
      .leftJoin(users, eq(auditTrail.userId, users.id))
      .where(eq(auditTrail.organizationId, currentUser.organizationId))
      .orderBy(desc(auditTrail.createdAt))
      .limit(limit)
      .offset(offset);

    const entries = rows.map((r) => ({
      id: r.id,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      metadata: r.metadata,
      createdAt: r.createdAt,
      actor: r.userId ? { id: r.userId, name: r.userName, email: r.userEmail } : null,
    }));

    return NextResponse.json({ entries, page, limit });
  });
}
