import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { organizations, users } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import * as authSchema from "@/db/schema/auth";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "No session" }, { status: 401 });

  let orgId = session.session?.activeOrganizationId;

  if (!orgId) {
    const [membership] = await db
      .select({ organizationId: authSchema.authMembers.organizationId })
      .from(authSchema.authMembers)
      .where(eq(authSchema.authMembers.userId, session.user.id))
      .limit(1);
    orgId = membership?.organizationId ?? null;
  }

  if (!orgId) return NextResponse.json({ error: "No active org" }, { status: 400 });

  const [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, orgId));
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  await db.execute(sql`SELECT set_config('app.current_org_id', ${org.id}, true)`);

  await db
    .insert(users)
    .values({
      clerkUserId: session.user.id,
      organizationId: org.id,
      email: session.user.email,
      name: session.user.name ?? "",
      role: "owner",
    })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        email: session.user.email,
        name: session.user.name ?? "",
      },
    });

  return NextResponse.json({ ok: true });
}
