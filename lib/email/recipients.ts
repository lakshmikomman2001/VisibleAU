import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { notificationPreferences, orgMembers, users } from "@/db/schema";

/**
 * Who gets a notification email (audit complete, and every alert).
 *
 * Preferences are per organisation -- notification_preferences has one
 * row per org, set on Settings > Notifications -- not per member, so
 * there's no individual opt-in to honour. The org's switch for the email
 * type decides whether it goes out at all; if it does, it goes to the
 * org's owner and admins. Analysts and viewers never get these.
 *
 * Each switch, and its value when the org has never saved its
 * preferences (no row) or the column is NULL -- the column's own
 * schema default:
 */
export const NOTIFICATION_PREFERENCES = {
  audit_complete: { column: "emailOnAuditComplete", defaultOn: false },
  schedule_failure: { column: "emailOnScheduleFailure", defaultOn: true },
  hallucination: { column: "emailOnHallucination", defaultOn: true },
  drift: { column: "emailOnDrift", defaultOn: true },
  consensus: { column: "emailOnConsensus", defaultOn: false },
  volatility: { column: "emailOnVolatility", defaultOn: false },
} as const;

export type NotificationType = keyof typeof NOTIFICATION_PREFERENCES;

export interface NotificationRecipients {
  /** False when the org has switched this email off. */
  enabled: boolean;
  /** Lower-cased, de-duplicated. Empty when switched off. */
  recipients: string[];
}

const RECIPIENT_ROLES = ["owner", "admin"];

/** org-provisioning's stand-in until sign-up's /api/auth/sync-user
 * writes the real address (lib/auth/server.ts) -- never a recipient. */
const PLACEHOLDER_EMAIL = "pending@sync.local";

/**
 * Reads through the app role with the org's RLS context, so it only sees
 * this org's rows. One consequence: an admin whose account belongs to
 * another org (everyone invited from outside) is outside that context,
 * so only owners and admins whose own account is in this org are found.
 */
export async function resolveNotificationRecipients(
  organizationId: string,
  type: NotificationType,
): Promise<NotificationRecipients> {
  return withRlsContext(organizationId, async (tx) => {
    const [prefs] = await tx
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.organizationId, organizationId))
      .limit(1);
    const { column, defaultOn } = NOTIFICATION_PREFERENCES[type];
    const enabled = prefs?.[column] ?? defaultOn;
    if (!enabled) return { enabled: false, recipients: [] };

    const accountRows = await tx
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.organizationId, organizationId), inArray(users.role, RECIPIENT_ROLES)));
    const memberRows = await tx
      .select({ email: users.email })
      .from(orgMembers)
      .innerJoin(users, eq(orgMembers.userId, users.id))
      .where(
        and(
          eq(orgMembers.organizationId, organizationId),
          inArray(orgMembers.role, RECIPIENT_ROLES),
          eq(orgMembers.isActive, true),
          isNotNull(orgMembers.acceptedAt),
        ),
      );

    const recipients = [
      ...new Set(
        [...accountRows, ...memberRows]
          .map((r) => r.email.trim().toLowerCase())
          .filter((email) => email.includes("@") && email !== PLACEHOLDER_EMAIL),
      ),
    ].sort();
    return { enabled: true, recipients };
  });
}
