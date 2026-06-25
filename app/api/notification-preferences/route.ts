import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { notificationPreferences } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const DEFAULTS = {
  weeklyDigest: true,
  emailOnDrift: true,
  emailOnAuditComplete: false,
  emailOnScheduleFailure: true,
};

const patchSchema = z.object({
  weeklyDigest: z.boolean().optional(),
  digestEmail: z.string().email().optional(),
  emailOnDrift: z.boolean().optional(),
  emailOnAuditComplete: z.boolean().optional(),
  emailOnScheduleFailure: z.boolean().optional(),
});

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.organizationId, currentUser.organizationId));

  if (!prefs) {
    return NextResponse.json({
      preferences: {
        ...DEFAULTS,
        digestEmail: currentUser.email,
      },
    });
  }

  return NextResponse.json({ preferences: prefs });
}

export async function PATCH(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [prefs] = await db
    .insert(notificationPreferences)
    .values({
      organizationId: currentUser.organizationId,
      digestEmail: parsed.data.digestEmail ?? currentUser.email,
      ...DEFAULTS,
      ...parsed.data,
    })
    .onConflictDoUpdate({
      target: [notificationPreferences.organizationId],
      set: {
        ...parsed.data,
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ preferences: prefs });
}
