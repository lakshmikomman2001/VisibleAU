import { createHash } from "node:crypto";
import { Resend } from "resend";
import { maskEmail } from "./mask";

export { maskEmail };

/**
 * The one way this app sends email: Resend, from RESEND_FROM_EMAIL.
 *
 * It never pretends. A missing RESEND_API_KEY or RESEND_FROM_EMAIL, or
 * anything Resend rejects, logs an error (addresses masked, no secrets)
 * and comes back as a typed failure the caller has to handle -- the old
 * SMTP shim (lib/email/client.ts, deleted) "succeeded" without sending.
 *
 * RESEND_DEV_RECIPIENT sends every email to one test inbox instead, and
 * only outside production (NODE_ENV !== "production", so every Vercel
 * deployment ignores it).
 *
 * 27 Oct: production's RESEND_FROM_EMAIL held the API key, so Resend got the
 * key as the from address and refused every email (422). The from address is
 * checked at startup and before every send (checkFromAddress): a value that
 * can't be used is never sent, and never logged. RESEND_API_KEY is read once,
 * straight into the client (tests/unit/email/resend-api-key-scan.test.ts).
 */

/** The first three are transactional (someone just asked for them); the
 * rest are notifications, which always link to the notification settings. */
export type EmailCategory =
  | "password_reset"
  | "email_verification"
  | "team_invite"
  | "audit_complete"
  | "scheduled_report"
  | "alert"
  | "weekly_digest";

export const TRANSACTIONAL_CATEGORIES: ReadonlySet<EmailCategory> = new Set<EmailCategory>([
  "password_reset",
  "email_verification",
  "team_invite",
]);

/** What production needs set; checked at startup (instrumentation.ts). */
export const EMAIL_ENV_NAMES = ["RESEND_API_KEY", "RESEND_FROM_EMAIL"] as const;

/** The domains RESEND_FROM_EMAIL may send from: the ones verified in Resend. */
export const ALLOWED_FROM_DOMAINS: readonly string[] = ["vunnara.com.au"];

/** Outside production only, when RESEND_FROM_EMAIL isn't set. Production has none. */
export const DEV_FROM_ADDRESS = "Vunnara Dev <dev@localhost>";

/** Why RESEND_FROM_EMAIL can't be used: logged as this, never as the value. */
export type FromAddressProblem = "from_format" | "from_domain" | "looks_like_secret";

export type FromAddressCheck =
  | { ok: true; from: string }
  | { ok: false; reason: "missing" | FromAddressProblem };

export interface SendEmailInput {
  /** One recipient per send, so each gets its own idempotency key. */
  to: string;
  subject: string;
  html: string;
  /** The plain-text version -- every template builds one (lib/email/templates/layout.ts). */
  text: string;
  category: EmailCategory;
  organizationId?: string;
  /** Required for anything sent from an Inngest step: Resend drops a
   * second request with the same key (for 24 hours), so a replayed step
   * never sends twice. Build it with idempotencyKeyFor(). */
  idempotencyKey?: string;
}

export type SendEmailFailureReason =
  | "missing_api_key"
  | "missing_from_address"
  | "invalid_from_address"
  | "provider_error";

export type SendEmailFailure = { ok: false; reason: SendEmailFailureReason; message: string };
export type SendEmailResult = { ok: true; id: string } | SendEmailFailure;

/** Thrown by sendEmailOrThrow -- inside an Inngest step this fails the
 * step, so Inngest retries it (and the idempotency key keeps any email
 * that did go out from going out again). */
export class EmailSendError extends Error {
  readonly reason: SendEmailFailureReason;
  constructor(failure: SendEmailFailure) {
    super(`Email not sent (${failure.reason}): ${failure.message}`);
    this.name = "EmailSendError";
    this.reason = failure.reason;
  }
}

/** Reserved for documentation (RFC 2606), so never a real address: Resend's messages
 * name "email@example.com" as the format, and that stays readable. */
const DOCUMENTATION_DOMAIN = /(?:^|\.)example\.(?:com|net|org)$/i;

/** Masks any address inside free text (a provider's error message). */
export function maskEmailsIn(text: string): string {
  return text.replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g, (m) => {
    const domain = m.slice(m.lastIndexOf("@") + 1).replace(/[^A-Za-z0-9-]+$/, "");
    return DOCUMENTATION_DOMAIN.test(domain) ? m : maskEmail(m);
  });
}

/** Anything shaped like a key or token, inside free text. */
const SECRET_IN_TEXT =
  /\b(?:re|sk|pk|rk|whsec)_[A-Za-z0-9_-]{4,}|\beyJ[\w-]+\.[\w-]+(?:\.[\w-]+)?/g;

/** Free text fit for a log line: addresses masked, anything like a key removed. */
function safeText(text: string): string {
  return maskEmailsIn(text.replace(SECRET_IN_TEXT, "[redacted]"));
}

/** A per-recipient idempotency key: `base` names the email (e.g.
 * "audit-complete:<auditId>"), the hash tells recipients apart without
 * putting an address in the key. */
export function idempotencyKeyFor(base: string, recipient: string): string {
  const hash = createHash("sha256").update(recipient.trim().toLowerCase()).digest("hex");
  return `${base}:${hash.slice(0, 16)}`;
}

export function missingEmailEnv(): string[] {
  return EMAIL_ENV_NAMES.filter((name) => !process.env[name]);
}

/** A key or a token, not an address: a Resend key (re_...) and the other usual shapes. */
function looksLikeSecret(value: string): boolean {
  if (value.startsWith("re_")) return true;
  if (value.includes("@")) return false;
  return (
    /^(?:sk|pk|rk|whsec)_[A-Za-z0-9_-]{8,}$/.test(value) ||
    /^eyJ[\w-]+\.[\w-]+/.test(value) ||
    /^[A-Za-z0-9_-]{24,}$/.test(value)
  );
}

const ADDRESS =
  /^[\w.!#$%&'*+/=?^`{|}~-]+@((?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,})$/;
/** "Display Name <address>": a name with at least one character, then the address. */
const NAMED = /^([^<>@\r\n]+?)\s*<([^<>\s]+)>$/;

/**
 * RESEND_FROM_EMAIL as a sender: "email@domain" or "Display Name <email@domain>", on
 * one of ALLOWED_FROM_DOMAINS, and nothing shaped like a key. Not set: production has
 * no fallback; elsewhere it's DEV_FROM_ADDRESS.
 */
export function checkFromAddress(raw: string | undefined): FromAddressCheck {
  const value = raw?.trim() ?? "";
  if (!value) {
    return process.env.NODE_ENV === "production"
      ? { ok: false, reason: "missing" }
      : { ok: true, from: DEV_FROM_ADDRESS };
  }
  if (looksLikeSecret(value)) return { ok: false, reason: "looks_like_secret" };
  const named = value.match(NAMED);
  const address = (named ? named[2] : value).match(ADDRESS);
  if (!address) return { ok: false, reason: "from_format" };
  if (!ALLOWED_FROM_DOMAINS.includes(address[1].toLowerCase())) {
    return { ok: false, reason: "from_domain" };
  }
  return { ok: true, from: value };
}

/** "misconfigured": both names are set, but the from address can't be used. */
export function emailBackendStatus(): "resend" | "disabled" | "misconfigured" {
  if (missingEmailEnv().includes("RESEND_API_KEY")) return "disabled";
  const from = checkFromAddress(process.env.RESEND_FROM_EMAIL);
  if (from.ok) return "resend";
  return from.reason === "missing" ? "disabled" : "misconfigured";
}

/**
 * The operator's signal besides the log line: an event in Sentry, which
 * instrumentation.ts starts (there is no ops-alert table). Tags only, never a
 * value; loaded only when there's something to report.
 */
function alertOperator(event: string, tags: Record<string, string>): void {
  import("@sentry/nextjs")
    .then((Sentry) => Sentry.captureMessage(event, { level: "error", tags }))
    .catch(() => {});
}

function reportInvalidFrom(
  reason: FromAddressProblem,
  at: "startup" | "send",
  category?: EmailCategory,
): void {
  const where = { at, ...(category ? { category } : {}) };
  console.error(JSON.stringify({ event: "email_config_invalid", reason, ...where }));
  alertOperator("email_config_invalid", { reason, ...where });
}

/** Once per cold start in production (instrumentation.ts): names and reasons only. */
export function logEmailConfigAtStartup(): void {
  const missing = missingEmailEnv();
  if (missing.length > 0) {
    console.error(JSON.stringify({ event: "email_disabled", reason: "missing_env", missing }));
    return;
  }
  const from = checkFromAddress(process.env.RESEND_FROM_EMAIL);
  if (!from.ok && from.reason !== "missing") reportInvalidFrom(from.reason, "startup");
}

/** The one place RESEND_API_KEY is read: straight into the client, nowhere else. */
function resendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  return apiKey ? new Resend(apiKey) : null;
}

/** What Resend answers when its own setup is wrong (the from address or domain, the key). */
const CONFIG_ERROR_STATUSES = new Set([401, 403, 422]);
const CONFIG_ERROR_NAMES = new Set([
  "validation_error",
  "invalid_from_address",
  "missing_api_key",
  "restricted_api_key",
  "invalid_api_key",
  "invalid_access",
]);

interface LogContext {
  category: EmailCategory;
  to: string;
  organizationId?: string;
  devRecipient?: true;
}

function fail(
  context: LogContext,
  reason: SendEmailFailureReason,
  message: string,
): SendEmailFailure {
  const safeMessage = safeText(message);
  console.error(
    JSON.stringify({ event: "email_send_failed", reason, ...context, message: safeMessage }),
  );
  return { ok: false, reason, message: safeMessage };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const devRecipient =
    process.env.NODE_ENV === "production"
      ? undefined
      : process.env.RESEND_DEV_RECIPIENT || undefined;
  const to = devRecipient ?? input.to;
  const context: LogContext = {
    category: input.category,
    to: maskEmail(to),
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    ...(devRecipient ? { devRecipient: true as const } : {}),
  };

  const resend = resendClient();
  if (!resend) return fail(context, "missing_api_key", "RESEND_API_KEY is not set");
  const from = checkFromAddress(process.env.RESEND_FROM_EMAIL);
  if (!from.ok) {
    if (from.reason === "missing") {
      return fail(context, "missing_from_address", "RESEND_FROM_EMAIL is not set");
    }
    reportInvalidFrom(from.reason, "send", input.category);
    return fail(
      context,
      "invalid_from_address",
      `RESEND_FROM_EMAIL can't be used (${from.reason})`,
    );
  }

  try {
    const { data, error } = await resend.emails.send(
      { from: from.from, to, subject: input.subject, html: input.html, text: input.text },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    );
    if (error) {
      const message = safeText(error.message);
      if (
        (error.statusCode !== null && CONFIG_ERROR_STATUSES.has(error.statusCode)) ||
        CONFIG_ERROR_NAMES.has(error.name)
      ) {
        // So a misconfiguration is plain in the logs after one attempt.
        console.error(
          JSON.stringify({
            event: "email_config_error",
            category: input.category,
            errorName: error.name,
            statusCode: error.statusCode,
            message,
          }),
        );
        alertOperator("email_config_error", {
          category: input.category,
          errorName: error.name,
          statusCode: String(error.statusCode ?? "none"),
        });
      }
      return fail(context, "provider_error", `${error.name}: ${message}`);
    }
    console.info(JSON.stringify({ event: "email_sent", ...context, id: data.id }));
    return { ok: true, id: data.id };
  } catch (err) {
    return fail(context, "provider_error", err instanceof Error ? err.message : "unknown error");
  }
}

/** sendEmail for Inngest steps: a failure throws EmailSendError. */
export async function sendEmailOrThrow(input: SendEmailInput): Promise<string> {
  const result = await sendEmail(input);
  if (!result.ok) throw new EmailSendError(result);
  return result.id;
}
