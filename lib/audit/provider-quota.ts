import { and, asc, eq, gt } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, brands, engineCallFailures, organizations } from "@/db/schema";
import { appUrl } from "@/lib/email/links";
import { operatorRecipients } from "@/lib/email/operator-recipients";
import { idempotencyKeyFor, sendEmailOrThrow } from "@/lib/email/send";
import { engineProviderQuotaEmail } from "@/lib/email/templates/alerts/engine-provider-quota";
import { claimOncePerWindow, releaseClaim } from "@/lib/governance/pg-rate-limit";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { type CallFailure, ERROR_MESSAGE_MAX_LENGTH } from "@/lib/llm/with-retry";

/**
 * S04B part 2 (LLD amendment 100): a provider refused a call because a spend limit, credit or quota on our account is
 * reached (error_class 'provider_quota', lib/llm/classify-error.ts). Live audit #57 (28 Nov 2026): Anthropic refused 10
 * of Claude's 13 calls, and the operator found out only by reading the database.
 *
 * - After the first refusal in an audit, that engine is sent no more calls in it: each remaining call is recorded as
 *   failed with the same class, attempts 0 and no request (both runners: lib/audit/run-audit-inline.ts keeps the stop
 *   in memory; inngest/functions/run-audit.ts reads it back from engine_call_failures, since its call steps can run in
 *   separate invocations). Calls already in flight when the first refusal comes back still finish.
 * - The per-engine panel and the PDF count them as today ("{n} failed — not counted"); customers see only "a problem
 *   on our side" (lib/audit/customer-reasons.ts), because the stored message keeps the provider's words, which
 *   lib/audit/engine-failure.ts names for the operator.
 * - The operators (PLATFORM_ADMIN_EMAILS) get one email per provider per 24 hours while refusals continue, through the
 *   existing alert path (claimOncePerWindow, as Google's account alert); /admin/settings lists the refusals.
 */

export const PROVIDER_QUOTA = "provider_quota" as const;

/** What a call not sent after the refusal records: the refusal's own message, so the reason named stays the same. */
export function notSentMessage(engine: string, refusalMessage: string): string {
  const name = (ENGINE_DISPLAY_NAMES as Record<string, string>)[engine] ?? engine;
  return `Not sent: ${name} refused an earlier call in this audit. ${refusalMessage}`.slice(
    0,
    ERROR_MESSAGE_MAX_LENGTH,
  );
}

/** The failure a call not sent records (lib/llm/with-retry.ts's CallFailure shape): no request, nothing billed. */
export function notSentFailure(engine: string, refusalMessage: string): CallFailure {
  return {
    status: "failure",
    errorClass: PROVIDER_QUOTA,
    errorMessage: notSentMessage(engine, refusalMessage),
    attempts: 0,
    latencyMs: 0,
    costUsd: 0,
    capReserveUsd: 0,
  };
}

/**
 * The message of this audit's first recorded refusal by `engine` (a call actually sent: attempts > 0), or null when it
 * has none. The Inngest runner reads it at the start of each call step.
 */
export async function recordedQuotaRefusal(
  db: DbClient,
  auditId: string,
  engine: string,
): Promise<string | null> {
  const [row] = await db
    .select({ message: engineCallFailures.errorMessage })
    .from(engineCallFailures)
    .where(
      and(
        eq(engineCallFailures.auditId, auditId),
        eq(engineCallFailures.engine, engine),
        eq(engineCallFailures.errorClass, PROVIDER_QUOTA),
        gt(engineCallFailures.attempts, 0),
      ),
    )
    .orderBy(asc(engineCallFailures.createdAt))
    .limit(1);
  return row ? (row.message ?? "") : null;
}

/**
 * The provider's own words from a stored failure message: without lib/llm/with-retry.ts's "HTTP 400
 * invalid_request_error: " prefix, Perplexity's "Perplexity API 402: " and, when that body is JSON, its error.message.
 */
export function providerMessageOf(stored: string): string {
  let text = stored.replace(/^HTTP \d{3}[^:]*: /, "").replace(/^Perplexity API \d{3}: /, "");
  if (text.startsWith("{")) {
    try {
      const body = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown };
      const message = body.error?.message ?? body.message;
      if (typeof message === "string" && message.trim()) text = message;
    } catch {
      // A body cut at 500 characters isn't JSON any more: shown as stored.
    }
  }
  return text.trim();
}

/** "Claude refused calls: its spend or quota limit is reached. {provider message}. Raise the limit in the provider's
 * console." (the sprint's wording; operators only). */
export function providerQuotaAlertText(engine: string, providerMessage: string): string {
  const name = (ENGINE_DISPLAY_NAMES as Record<string, string>)[engine] ?? engine;
  const words = providerMessage.trim();
  const said = words ? `${words}${/[.!?]$/.test(words) ? "" : "."} ` : "";
  return `${name} refused calls: its spend or quota limit is reached. ${said}Raise the limit in the provider's console.`;
}

const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The rate_limit_counters key that keeps the alert to one per provider per 24 hours. */
export function providerQuotaAlertKey(engine: string): string {
  return `engine-provider-quota-alert:${engine}`;
}

/**
 * Emails the operators about a refusal, at most once per provider per 24 hours (given back if the send fails, so the
 * next refusal tries again). Never throws: an audit's call is never failed by its alert. Returns how many emails went
 * out.
 */
export async function alertOperatorsOnProviderQuota(
  db: DbClient,
  input: { auditId: string; engine: string; message: string },
): Promise<number> {
  const providerMessage = providerMessageOf(input.message);
  console.warn(
    JSON.stringify({
      event: "engine_provider_quota",
      auditId: input.auditId,
      engine: input.engine,
    }),
  );
  const recipients = operatorRecipients();
  if (recipients.length === 0) {
    console.warn(
      JSON.stringify({
        event: "engine_provider_quota_no_operator",
        auditId: input.auditId,
        reason: "PLATFORM_ADMIN_EMAILS is not set",
      }),
    );
    return 0;
  }
  const key = providerQuotaAlertKey(input.engine);
  try {
    if (!(await claimOncePerWindow(key, ALERT_WINDOW_MS))) {
      console.log(
        JSON.stringify({
          event: "engine_provider_quota_alert_deduplicated",
          auditId: input.auditId,
          engine: input.engine,
        }),
      );
      return 0;
    }
  } catch (err) {
    console.error("[provider-quota] couldn't claim the alert:", err);
    return 0;
  }
  try {
    const [meta] = await db
      .select({
        auditNumber: audits.auditNumber,
        organizationId: audits.organizationId,
        brand: brands.name,
        workspace: organizations.name,
      })
      .from(audits)
      .leftJoin(brands, eq(brands.id, audits.brandId))
      .leftJoin(organizations, eq(organizations.id, audits.organizationId))
      .where(eq(audits.id, input.auditId));
    const email = engineProviderQuotaEmail({
      engineName: (ENGINE_DISPLAY_NAMES as Record<string, string>)[input.engine] ?? input.engine,
      text: providerQuotaAlertText(input.engine, providerMessage),
      auditNumber: meta?.auditNumber ?? 0,
      brandName: meta?.brand ?? "",
      organizationName: meta?.workspace ?? "",
      adminUrl: appUrl("/admin/settings"),
    });
    for (const to of recipients) {
      await sendEmailOrThrow({
        to,
        ...email,
        category: "alert",
        organizationId: meta?.organizationId,
        idempotencyKey: idempotencyKeyFor(
          `engine-provider-quota:${input.engine}:${input.auditId}`,
          to,
        ),
      });
    }
    return recipients.length;
  } catch (err) {
    await releaseClaim(key).catch(() => {});
    console.error("[provider-quota] the operator alert wasn't sent:", err);
    return 0;
  }
}
