import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { appUrl } from "@/lib/email/links";
import { resolveNotificationRecipients } from "@/lib/email/recipients";
import { idempotencyKeyFor, sendEmailOrThrow } from "@/lib/email/send";
import { auditCompleteEmail } from "@/lib/email/templates/audit-complete";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";

/**
 * "Audit complete" goes to the org's owner and admins, unless the org has
 * switched "Email on Audit Complete" off (Settings > Notifications; on by
 * default since A1, 31 Oct) -- lib/email/recipients.ts. It used to go to
 * RESEND_DEV_RECIPIENT ?? "dev@visibleau.local", in every environment,
 * so owners never got it.
 */
export const sendAuditCompleteEmail = inngest.createFunction(
  {
    id: "send-audit-complete-email",
    retries: 3,
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: "audit.complete" }],
  },
  async ({ event, step }) => {
    const { auditId } = event.data as { auditId: string };

    const emailData = await step.run("load-audit-for-email", async () => {
      const [audit] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
      const [brand] = await serviceDb.select().from(brands).where(eq(brands.id, audit.brandId));
      // Task #46 (fix: stored value contradicting its own CI): this fires
      // right after an audit completes -- audit.scoreComposite at THIS
      // exact moment is normally fresh, but trusting the stored column
      // instead of the one shared recompute is exactly the pattern that
      // goes stale the moment a later prod-fix changes which citations
      // rows count as organic (the live bug this fix addresses was found
      // via this same kind of mismatch). Single audit, cheap to recompute.
      //
      // Vunnara (19 Oct): the headline is the Frequency mention rate
      // alone (never a weighted blend), and is insufficient_data only
      // when there were zero successful organic answers -- null here.
      const { headline, sampleCount, mentionedCount } = await resolveAuditDimensionsAndHeadline(
        serviceDb,
        auditId,
      );
      return {
        organizationId: audit.organizationId,
        auditNumber: audit.auditNumber,
        brandName: brand.name,
        mentionRate: headline.status === "scored" ? headline.value : null,
        sampleCount,
        mentionedCount,
        completedAt: audit.completedAt?.toISOString() ?? null,
      };
    });

    const { enabled, recipients } = await step.run("resolve-recipients", () =>
      resolveNotificationRecipients(emailData.organizationId, "audit_complete"),
    );
    if (!enabled || recipients.length === 0) {
      console.info(
        JSON.stringify({
          event: "email_skipped",
          category: "audit_complete",
          reason: enabled ? "no_recipients" : "switched_off",
          organizationId: emailData.organizationId,
        }),
      );
      return { sent: 0 };
    }

    await step.run("send-email", async () => {
      // The page's own headline ("Visibility 8% · mentioned in 3 of 40
      // answers"), the finish time in the org's time zone and a link.
      const email = auditCompleteEmail({
        brandName: emailData.brandName,
        auditNumber: emailData.auditNumber,
        mentionRate: emailData.mentionRate,
        mentionedCount: emailData.mentionedCount,
        sampleCount: emailData.sampleCount,
        completedAt: emailData.completedAt ? new Date(emailData.completedAt) : null,
        organizationId: emailData.organizationId,
        auditUrl: appUrl(`/audits/${auditId}`),
      });
      // A failed send fails this step, so Inngest retries it; each
      // recipient's key stops a retry or replay sending them a second copy.
      for (const to of recipients) {
        await sendEmailOrThrow({
          to,
          ...email,
          category: "audit_complete",
          organizationId: emailData.organizationId,
          idempotencyKey: idempotencyKeyFor(`audit-complete:${auditId}`, to),
        });
      }
    });
    return { sent: recipients.length };
  },
);
