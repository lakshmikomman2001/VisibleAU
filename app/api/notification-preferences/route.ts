import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { notificationPreferences } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { sameAddress } from "@/lib/auth/invite";
import { NOTIFICATION_PREFERENCES } from "@/lib/email/recipients";
import { roleRefusal } from "@/lib/governance";

// An org that has never saved: the same defaults the sender applies
// (lib/email/recipients.ts), so the page shows what will actually happen.
const DEFAULTS = {
  weeklyDigest: true,
  emailOnDrift: NOTIFICATION_PREFERENCES.drift.defaultOn,
  emailOnAuditComplete: NOTIFICATION_PREFERENCES.audit_complete.defaultOn,
  emailOnScheduleFailure: NOTIFICATION_PREFERENCES.schedule_failure.defaultOn,
};

const patchSchema = z.object({
  weeklyDigest: z.boolean().optional(),
  digestEmail: z.string().email().optional(),
  emailOnDrift: z.boolean().optional(),
  emailOnAuditComplete: z.boolean().optional(),
  emailOnScheduleFailure: z.boolean().optional(),
});

/*
 * Sri, 8 Nov: these are the workspace's settings -- which alerts go out, and where the weekly digest goes --
 * so only an owner or admin changes them (PATCH). What any role may still do is stop email sent to them:
 * the only email a setting addresses to a person is the weekly digest, so that's
 * POST /api/notification-preferences/stop-my-digest, allowed only while the digest goes to their own
 * address. Alerts go to owners and admins (lib/email/recipients.ts), who can change these settings.
 */

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [prefs] = await tx
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.organizationId, currentUser.organizationId));

    if (!prefs) {
      return NextResponse.json({
        preferences: {
          ...DEFAULTS,
          digestEmail: currentUser.email,
        },
        // Nothing is sent until the settings are saved (inngest/functions/weekly-digest-cron.ts).
        digestToYou: false,
      });
    }

    return NextResponse.json({
      preferences: prefs,
      digestToYou: prefs.weeklyDigest && sameAddress(prefs.digestEmail, currentUser.email),
    });
  });
}

export async function PATCH(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const forbidden = await roleRefusal(currentUser, "manage_notifications");
  if (forbidden) return forbidden;

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

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [prefs] = await tx
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
  });
}
