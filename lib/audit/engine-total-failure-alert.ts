import { and, eq, inArray } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands, engineCallFailures, organizations } from "@/db/schema";
import { appUrl } from "@/lib/email/links";
import { operatorRecipients } from "@/lib/email/operator-recipients";
import { resolveAlertRecipients } from "@/lib/email/recipients";
import { idempotencyKeyFor, sendEmailOrThrow } from "@/lib/email/send";
import {
  type EngineTotalFailureEmailEngine,
  engineTotalFailureEmail,
} from "@/lib/email/templates/alerts/engine-total-failure";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";
import {
  describeEngineFailure,
  engineTotalFailureSentence,
  fullyFailedEngines,
  statusCodeFromMessage,
} from "./engine-failure";

/**
 * URGENT audit #37 (31 Oct), item 2 -- when an audit finishes with at
 * least one engine at 100% failure: log `engine_total_failure` (engine,
 * error class, status code, reason -- no address, no message) and email
 * the org's owners and admins and the operator (PLATFORM_ADMIN_EMAILS),
 * once.
 *
 * Used by inngest/functions/notify-engine-total-failure.ts (on
 * audit.complete, one step per half) and by lib/audit/run-audit-inline.ts
 * (the fallback runner, which sends no audit.complete). Each recipient's
 * idempotency key is per audit, so a replay or a retried step never sends
 * a second copy.
 */
export interface EngineTotalFailureAlert {
  auditId: string;
  organizationId: string;
  organizationName: string;
  brandName: string;
  auditNumber: number;
  sentence: string;
  engines: EngineTotalFailureEmailEngine[];
}

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  let top: T | undefined;
  let topCount = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > topCount) {
      top = v;
      topCount = n;
    }
  }
  return top;
}

/** Null unless the audit is complete and at least one engine answered nothing. Logs each such engine. */
export async function findEngineTotalFailures(
  auditId: string,
): Promise<EngineTotalFailureAlert | null> {
  const [audit] = await serviceDb
    .select({
      id: audits.id,
      status: audits.status,
      organizationId: audits.organizationId,
      brandId: audits.brandId,
      auditNumber: audits.auditNumber,
      engines: audits.engines,
      promptsCount: audits.promptsCount,
      metadata: audits.metadata,
    })
    .from(audits)
    .where(eq(audits.id, auditId));
  if (audit?.status !== "complete") return null;
  const failedEngines = fullyFailedEngines(audit);
  if (failedEngines.length === 0) return null;

  const rows = await serviceDb
    .select({
      engine: engineCallFailures.engine,
      errorClass: engineCallFailures.errorClass,
      errorMessage: engineCallFailures.errorMessage,
    })
    .from(engineCallFailures)
    .where(
      and(
        eq(engineCallFailures.auditId, auditId),
        inArray(engineCallFailures.engine, failedEngines),
      ),
    );

  const engines: EngineTotalFailureEmailEngine[] = failedEngines.map((engine) => {
    const own = rows.filter((r) => r.engine === engine);
    const errorClass = mostCommon(own.map((r) => r.errorClass)) ?? "other";
    const statusCode =
      mostCommon(
        own
          .map((r) => statusCodeFromMessage(r.errorMessage))
          .filter((c): c is number => c !== null),
      ) ?? null;
    const reason = describeEngineFailure({
      errorClass,
      message: own.find((r) => r.errorClass === errorClass)?.errorMessage ?? null,
    });
    console.warn(
      JSON.stringify({
        event: "engine_total_failure",
        auditId,
        organizationId: audit.organizationId,
        engine,
        errorClass,
        statusCode,
        reason: reason.key,
        failedCalls: own.length,
      }),
    );
    return {
      engine,
      reasonLabel: reason.label,
      reasonCheck: reason.check,
      errorClass,
      statusCode,
    };
  });

  const [brand] = await serviceDb
    .select({ name: brands.name })
    .from(brands)
    .where(eq(brands.id, audit.brandId));
  const [org] = await serviceDb
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, audit.organizationId));
  const { sampleCount } = await resolveAuditDimensionsAndHeadline(serviceDb, auditId);

  return {
    auditId,
    organizationId: audit.organizationId,
    organizationName: org?.name ?? "",
    brandName: brand?.name ?? "",
    auditNumber: audit.auditNumber,
    sentence: engineTotalFailureSentence({
      engines: failedEngines,
      questionCount: audit.promptsCount ?? 0,
      enginesAsked: audit.engines?.length ?? 0,
      answerCount: sampleCount,
    }),
    engines,
  };
}

/**
 * One email per recipient: the operator copy to PLATFORM_ADMIN_EMAILS, the
 * org copy to the org's owners and admins (engine-failure follow-ups,
 * 1 Nov, item 3 -- the same people as every other alert, invited admins
 * included; analysts and viewers never). Someone on both lists gets the
 * operator copy only.
 */
export async function sendEngineTotalFailureEmails(
  alert: EngineTotalFailureAlert,
): Promise<number> {
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
    const email = engineTotalFailureEmail({ audience, auditUrl, ...alert });
    await sendEmailOrThrow({
      to,
      ...email,
      category: "alert",
      organizationId: alert.organizationId,
      idempotencyKey: idempotencyKeyFor(`engine-total-failure:${alert.auditId}`, to),
    });
  }
  if (operators.length === 0) {
    console.warn(
      JSON.stringify({
        event: "engine_total_failure_no_operator",
        auditId: alert.auditId,
        reason: "PLATFORM_ADMIN_EMAILS is not set",
      }),
    );
  }
  return sends.length;
}

/** Both halves, for the inline runner. */
export async function sendEngineTotalFailureAlert(auditId: string): Promise<number> {
  const alert = await findEngineTotalFailures(auditId);
  if (!alert) return 0;
  return sendEngineTotalFailureEmails(alert);
}
