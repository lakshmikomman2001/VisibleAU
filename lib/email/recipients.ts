import { eq, sql } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { notificationPreferences, organizations } from "@/db/schema";

/**
 * Who gets a notification email (audit complete, and every alert).
 *
 * Preferences are per organisation -- notification_preferences has one
 * row per org, set on Settings > Notifications -- not per member, so
 * there's no individual opt-in to honour. The org's switch for the email
 * type decides whether it goes out at all; if it does, it goes to the
 * org's owner and admins: its accepted, active owner and admin
 * memberships, nobody else (Sri, 8 Nov). Analysts and viewers never get
 * these, and neither does an invite still pending -- one answered "Not
 * now" included -- or a member who was removed.
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

/** org-provisioning's stand-in until sign-up's /api/auth/sync-user
 * writes the real address (lib/auth/server.ts) -- never a recipient. */
const PLACEHOLDER_EMAIL = "pending@sync.local";

function cleanRecipients(emails: string[]): string[] {
  return [
    ...new Set(
      emails
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.includes("@") && email !== PLACEHOLDER_EMAIL),
    ),
  ].sort();
}

type RlsTx = Parameters<Parameters<typeof withRlsContext>[1]>[0];

/**
 * The org's owners and admins, inside its RLS context: from
 * app_notification_recipients() (migration 0107; B1, Sri 31 Oct), a
 * SECURITY DEFINER function that returns only (user_id, email) of the
 * context org's accepted, active owner and admin members -- an admin
 * invited from another org included, whose users row the app role can't
 * see. This is its only caller (tests/unit/email/
 * notification-recipients-function-callers.test.ts).
 *
 * Sri, 8 Nov: nothing else. It also read every profile in the org whose
 * users.role said owner or admin, membership or not, so someone removed
 * from the team, or re-invited and not yet accepted, still got the
 * workspace's email while their profile was in it.
 */
async function ownerAndAdminEmails(tx: RlsTx): Promise<string[]> {
  const memberRows = await tx.execute<{ user_id: string; email: string }>(
    sql`SELECT user_id, email FROM app_notification_recipients()`,
  );
  return cleanRecipients(memberRows.map((r) => r.email));
}

/**
 * The "a whole engine failed" alert (URGENT audit #37, 31 Oct; recipients
 * per engine-failure follow-ups, 1 Nov, item 3): the org's owners and
 * admins, invited admins included -- the same people as every other
 * alert. Not gated by a notification switch: it's about whether the
 * audit's numbers are whole, not a routine notification, and there's no
 * switch for it. A closed workspace has nobody.
 */
export async function resolveAlertRecipients(organizationId: string): Promise<string[]> {
  return withRlsContext(organizationId, async (tx) => {
    const [org] = await tx
      .select({ deletedAt: organizations.deletedAt })
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    if (!org || org.deletedAt) return [];
    return ownerAndAdminEmails(tx);
  });
}

/**
 * Reads through the app role with the org's RLS context
 * (ownerAndAdminEmails).
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

    return { enabled: true, recipients: await ownerAndAdminEmails(tx) };
  });
}
