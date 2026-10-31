import { and, eq, inArray, sql } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { notificationPreferences, organizations, users } from "@/db/schema";

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
 * schema default. Audit complete is on by default (A1, Sri 31 Oct;
 * migration 0106): only a saved false switches it off.
 */
export const NOTIFICATION_PREFERENCES = {
  audit_complete: { column: "emailOnAuditComplete", defaultOn: true },
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
 * this org's rows -- with one exception. An admin invited from another
 * org keeps their users row in their home org, outside this context, so
 * members come from app_notification_recipients() (migration 0107; B1,
 * Sri 31 Oct): a SECURITY DEFINER function that returns only (user_id,
 * email) of the context org's accepted, active owner and admin members.
 * This is its only caller (tests/unit/email/
 * notification-recipients-function-callers.test.ts).
 *
 * A closed workspace (organizations.deleted_at set) gets no emails, as
 * if every switch were off.
 */
export async function resolveNotificationRecipients(
  organizationId: string,
  type: NotificationType,
): Promise<NotificationRecipients> {
  return withRlsContext(organizationId, async (tx) => {
    const [org] = await tx
      .select({ deletedAt: organizations.deletedAt })
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    if (org?.deletedAt) return { enabled: false, recipients: [] };

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
    const memberRows = await tx.execute<{ user_id: string; email: string }>(
      sql`SELECT user_id, email FROM app_notification_recipients()`,
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
