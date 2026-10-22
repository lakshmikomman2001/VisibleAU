import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { resend } from "@/lib/email/client";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";

export const sendAuditCompleteEmail = inngest.createFunction(
  {
    id: "send-audit-complete-email",
    retries: 3,
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: "audit.complete" }],
  },
  async ({ event, step }: { event: { data: { auditId: string } }; step: any }) => {
    const { auditId } = event.data;

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

    await step.run("send-email", async () => {
      const auditResultsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/audits/${auditId}`;
      const scored = emailData.mentionRate != null;
      const subjectScore = scored
        ? `mentioned in ${emailData.mentionRate.toFixed(0)}% of AI answers`
        : "not enough data yet";
      const bodyScore = scored
        ? `Mentioned in ${emailData.mentionedCount} of ${emailData.sampleCount} AI answers (${emailData.mentionRate.toFixed(1)}%)`
        : "Not enough data yet: no AI answers came back successfully for this audit.";
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "noreply@visibleau.local",
        to: process.env.RESEND_DEV_RECIPIENT ?? "dev@visibleau.local",
        subject: `Audit complete: ${emailData.brandName} — ${subjectScore}`,
        html: `<h1>Audit complete: ${emailData.brandName}</h1><p>Audit #${emailData.auditNumber} · ${emailData.promptCount} prompts · ${emailData.engine}</p><p>${bodyScore}</p><p><a href="${auditResultsUrl}">View results</a></p>`,
      });
    });
  },
);
