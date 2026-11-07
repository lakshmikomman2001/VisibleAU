import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { notificationPreferences } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { refusalMessage } from "@/lib/governance";

/**
 * Sri, 8 Nov -- any role can turn off email sent to them, while the workspace's email settings are an
 * owner's or admin's (PATCH /api/notification-preferences). The only email a setting sends to a person is
 * the weekly digest, at the digest address: this stops it, and only while that address is the caller's own.
 * Sent somewhere else, it isn't theirs to stop: 403, saying who can change it.
 */
export async function POST() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [stopped] = await tx
      .update(notificationPreferences)
      .set({ weeklyDigest: false, updatedAt: new Date() })
      .where(
        and(
          eq(notificationPreferences.organizationId, currentUser.organizationId),
          eq(notificationPreferences.weeklyDigest, true),
          sql`lower(trim(${notificationPreferences.digestEmail})) = lower(trim(${currentUser.email}))`,
        ),
      )
      .returning({ id: notificationPreferences.id });
    if (stopped) return NextResponse.json({ weeklyDigest: false });

    const [prefs] = await tx
      .select({ weeklyDigest: notificationPreferences.weeklyDigest })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.organizationId, currentUser.organizationId));
    if (prefs?.weeklyDigest) {
      return NextResponse.json(
        {
          error: `The weekly digest goes to another address. ${refusalMessage("manage_notifications")}`,
        },
        { status: 403 },
      );
    }
    // Nothing is being sent to anyone.
    return NextResponse.json({ weeklyDigest: false });
  });
}
