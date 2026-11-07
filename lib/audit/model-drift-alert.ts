import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands, organizations } from "@/db/schema";
import { auditModelDrift } from "@/lib/audit/model-drift";
import { appUrl } from "@/lib/email/links";
import { operatorRecipients } from "@/lib/email/operator-recipients";
import { resolveAlertRecipients } from "@/lib/email/recipients";
import { idempotencyKeyFor, sendEmailOrThrow } from "@/lib/email/send";
import { modelDriftEmail } from "@/lib/email/templates/alerts/model-drift";
import type { ModelDrift } from "@/lib/llm/model-drift";

/**
 * Sri's decision 6 (7 Nov) -- when a provider answered an audit's questions with a different model than the
 * one asked for (lib/llm/model-drift.ts), the audit page and the PDF's method page say so, and the org's
 * owners and admins and the operator ([ops]) are emailed once per audit -- the same pattern as the
 * whole-engine-failure alert (lib/audit/engine-total-failure-alert.ts).
 *
 * Used by inngest/functions/notify-model-drift.ts (on audit.complete, one step per half) and by
 * lib/audit/run-audit-inline.ts (the fallback runner, which sends no audit.complete). Each recipient's
 * idempotency key is per audit, so a replay or a retried step never sends a second copy.
 */

export interface ModelDriftAlert {
  auditId: string;
  organizationId: string;
  organizationName: string;
  brandName: string;
  auditNumber: number;
  drift: ModelDrift[];
}

/** Null unless the audit is complete and at least one engine answered with another model. Logs each. */
export async function findModelDriftAlert(auditId: string): Promise<ModelDriftAlert | null> {
  const [audit] = await serviceDb
    .select({
      status: audits.status,
      organizationId: audits.organizationId,
      brandId: audits.brandId,
      auditNumber: audits.auditNumber,
    })
    .from(audits)
    .where(eq(audits.id, auditId));
  if (audit?.status !== "complete") return null;
  const drift = await auditModelDrift(serviceDb, auditId);
  if (drift.length === 0) return null;

  for (const d of drift) {
    console.warn(
      JSON.stringify({
        event: "model_drift",
        auditId,
        organizationId: audit.organizationId,
        engine: d.engine,
        requested: d.requested,
        answered: d.answered,
        answers: d.answers,
        engineAnswers: d.engineAnswers,
      }),
    );
  }

  const [brand] = await serviceDb
    .select({ name: brands.name })
    .from(brands)
    .where(eq(brands.id, audit.brandId));
  const [org] = await serviceDb
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, audit.organizationId));

  return {
    auditId,
    organizationId: audit.organizationId,
    organizationName: org?.name ?? "",
    brandName: brand?.name ?? "",
    auditNumber: audit.auditNumber,
    drift,
  };
}

/** One email per recipient: the org's owners and admins, and the operator copy to PLATFORM_ADMIN_EMAILS.
 * Someone on both lists gets the operator copy only. */
export async function sendModelDriftEmails(alert: ModelDriftAlert): Promise<number> {
  const operators = operatorRecipients();
  const members = (await resolveAlertRecipients(alert.organizationId)).filter(
    (email) => !operators.includes(email),
  );
  const auditUrl = appUrl(`/audits/${alert.auditId}`);
  const sends: Array<{ to: string; audience: "org" | "operator" }> = [
    ...members.map((to) => ({ to, audience: "org" as const })),
    ...operators.map((to) => ({ to, audience: "operator" as const })),
  ];
  for (const { to, audience } of sends) {
    const email = modelDriftEmail({ audience, auditUrl, ...alert });
    await sendEmailOrThrow({
      to,
      ...email,
      category: "alert",
      organizationId: alert.organizationId,
      idempotencyKey: idempotencyKeyFor(`model-drift:${alert.auditId}`, to),
    });
  }
  if (operators.length === 0) {
    console.warn(
      JSON.stringify({
        event: "model_drift_no_operator",
        auditId: alert.auditId,
        reason: "PLATFORM_ADMIN_EMAILS is not set",
      }),
    );
  }
  return sends.length;
}

/** Both halves, for the inline runner. */
export async function sendModelDriftAlert(auditId: string): Promise<number> {
  const alert = await findModelDriftAlert(auditId);
  if (!alert) return 0;
  return sendModelDriftEmails(alert);
}
