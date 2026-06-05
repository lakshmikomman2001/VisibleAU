import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { resend } from "@/lib/email/client";
import { inngest } from "@/lib/inngest/client";

export const sendAuditCompleteEmail = inngest.createFunction(
  { id: "send-audit-complete-email", retries: 3, triggers: [{ event: "audit.complete" }] },
  async ({ event, step }: { event: { data: { auditId: string } }; step: any }) => {
    const { auditId } = event.data;

    const emailData = await step.run("load-audit-for-email", async () => {
      const [audit] = await db.select().from(audits).where(eq(audits.id, auditId));
      const [brand] = await db.select().from(brands).where(eq(brands.id, audit.brandId));
      return {
        auditNumber: audit.auditNumber,
        brandName: brand.name,
        compositeScore: audit.scoreComposite ? parseFloat(audit.scoreComposite) : null,
        promptCount: audit.promptsCount ?? 10,
        engine: (audit.engines ?? ["chatgpt"])[0],
      };
    });

    await step.run("send-email", async () => {
      const auditResultsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/audits/${auditId}`;
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "noreply@visibleau.local",
        to: process.env.RESEND_DEV_RECIPIENT ?? "dev@visibleau.local",
        subject: `Audit complete: ${emailData.brandName} — Score ${emailData.compositeScore?.toFixed(1) ?? "…"}/100`,
        html: `<h1>Audit complete: ${emailData.brandName}</h1><p>Audit #${emailData.auditNumber} · ${emailData.promptCount} prompts · ${emailData.engine}</p><p>Score: ${emailData.compositeScore?.toFixed(1) ?? "…"}/100</p><p><a href="${auditResultsUrl}">View results</a></p>`,
      });
    });
  },
);
