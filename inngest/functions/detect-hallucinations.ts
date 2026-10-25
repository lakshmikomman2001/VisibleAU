import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { sendHallucinationAlert } from "@/lib/communication/alert-composer";
import { appUrl } from "@/lib/email/links";
import { EmailSendError, type SendEmailFailure } from "@/lib/email/send";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import { detectHallucinations } from "@/lib/trust/hallucination-detector";

export const detectHallucinationsFn = inngest.createFunction(
  {
    id: "detect-hallucinations",
    retries: 2,
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: "audit.complete" }],
  },
  async ({ event, step }) => {
    const { auditId, brandId, organizationId } = event.data as {
      auditId: string;
      brandId: string;
      organizationId: string;
    };

    const result = await step.run("detect", async () => {
      return detectHallucinations(serviceDb, auditId, brandId, organizationId);
    });

    if (result.criticalCount > 0 || result.warningCount > 0) {
      await step.run("send-alert", async () => {
        const [brand] = await serviceDb
          .select({ name: brands.name })
          .from(brands)
          .where(eq(brands.id, brandId))
          .limit(1);
        const [audit] = await serviceDb
          .select({ auditNumber: audits.auditNumber })
          .from(audits)
          .where(eq(audits.id, auditId))
          .limit(1);

        const brandName = brand?.name ?? "Unknown Brand";

        // Task 15: what was actually found (counts by severity, which
        // audit) and an absolute link -- it used to send "engine:
        // multiple", "correct value: Review required" and a relative URL.
        const sent = await sendHallucinationAlert({
          organizationId,
          idempotencyBase: `hallucination:${auditId}`,
          brandName,
          auditNumber: audit?.auditNumber ?? null,
          criticalCount: result.criticalCount,
          warningCount: result.warningCount,
          reviewUrl: appUrl(`/brands/${brandId}/trust/hallucinations`),
        });
        // A failed send fails the step, so Inngest retries it.
        const failed = sent.find((r): r is SendEmailFailure => !r.ok);
        if (failed) throw new EmailSendError(failed);
      });

      await step.run("emit-webhook", async () => {
        await inngest.send({
          name: "hallucination/detected",
          data: { organizationId, brandId, incidentCount: result.inserted },
        });
      });
    }

    return {
      inserted: result.inserted,
      critical: result.criticalCount,
      warning: result.warningCount,
    };
  },
);
