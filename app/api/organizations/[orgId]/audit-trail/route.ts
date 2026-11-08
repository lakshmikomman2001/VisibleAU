import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { auditTrail, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { userCan } from "@/lib/governance";
import { ACTOR_NAME_KEY } from "@/lib/governance/audit-trail";

export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (orgId !== currentUser.organizationId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The role from the active membership only (follow-ups from 6e27afc..01a6a8c, part 1).
  if (!(await userCan(currentUser, "view_audit_trail")))
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

    // Someone who has left the workspace is hidden from it (RLS): their name comes from the entry itself
    // (lib/governance/audit-trail.ts ACTOR_NAME_KEY), which isn't shown again among the details.
    const entries = rows.map((r) => {
      const { [ACTOR_NAME_KEY]: recordedName, ...metadata } = (r.metadata ?? {}) as Record<
        string,
        unknown
      >;
      return {
        id: r.id,
        action: r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        metadata: r.metadata ? metadata : null,
        createdAt: r.createdAt,
        actor: r.userId
          ? {
              id: r.userId,
              name: r.userName ?? (typeof recordedName === "string" ? recordedName : null),
              email: r.userEmail,
            }
          : null,
      };
    });

    return NextResponse.json({ entries, page, limit });
  });
}
