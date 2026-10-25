import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { notificationSettingsUrl } from "@/lib/email/links";
import { resolveNotificationRecipients } from "@/lib/email/recipients";
import { idempotencyKeyFor, sendEmailOrThrow } from "@/lib/email/send";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";

/**
 * "Audit complete" goes to the org's owner and admins, and only when the
 * org has "Email on Audit Complete" switched on (Settings > Notifications;
 * off by default) -- lib/email/recipients.ts. It used to go to
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
        promptCount: audit.promptsCount ?? 10,
        engine:
          ENGINE_DISPLAY_NAMES[
            (audit.engines ?? ["chatgpt"])[0] as keyof typeof ENGINE_DISPLAY_NAMES
          ] ?? (audit.engines ?? ["chatgpt"])[0],
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
      const auditResultsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/audits/${auditId}`;
      const scored = emailData.mentionRate != null;
      const subjectScore = scored
        ? `mentioned in ${emailData.mentionRate?.toFixed(0)}% of AI answers`
        : "not enough data yet";
      const bodyScore = scored
        ? `Mentioned in ${emailData.mentionedCount} of ${emailData.sampleCount} AI answers (${emailData.mentionRate?.toFixed(1)}%)`
        : "Not enough data yet: no AI answers came back successfully for this audit.";
      // A failed send fails this step, so Inngest retries it; each
      // recipient's key stops a retry or replay sending them a second copy.
      for (const to of recipients) {
        await sendEmailOrThrow({
          to,
          subject: `Audit complete: ${emailData.brandName} — ${subjectScore}`,
          html: `<h1>Audit complete: ${emailData.brandName}</h1><p>Audit #${emailData.auditNumber} · ${emailData.promptCount} prompts · ${emailData.engine}</p><p>${bodyScore}</p><p><a href="${auditResultsUrl}">View results</a></p><p><a href="${notificationSettingsUrl()}">Notification settings</a></p>`,
          category: "audit_complete",
          organizationId: emailData.organizationId,
          idempotencyKey: idempotencyKeyFor(`audit-complete:${auditId}`, to),
        });
      }
    });
    return { sent: recipients.length };
  },
);
