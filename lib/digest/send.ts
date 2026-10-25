import { idempotencyKeyFor, sendEmailOrThrow } from "@/lib/email/send";
import type { RenderedEmail } from "@/lib/email/templates/layout";
import { getOrgTimezone } from "@/lib/platform/org-timezone";

/** The weekly digest, through lib/email/send.ts. A failure throws (it's
 * sent from an Inngest step, which then retries); the key -- one per
 * org, recipient and day -- stops a retry sending it twice. */
export async function sendDigestEmail(
  to: string,
  email: RenderedEmail,
  organizationId: string,
): Promise<void> {
  const today = new Date().toLocaleDateString("en-AU", { timeZone: getOrgTimezone() });
  await sendEmailOrThrow({
    to,
    ...email,
    category: "weekly_digest",
    organizationId,
    idempotencyKey: idempotencyKeyFor(`weekly-digest:${organizationId}:${today}`, to),
  });
}
