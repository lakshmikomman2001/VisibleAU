import { createHash } from "node:crypto";
import { Resend } from "resend";

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

export type SendEmailFailureReason = "missing_api_key" | "missing_from_address" | "provider_error";

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

/** "sri@vunnara.com.au" -> "s***@vunnara.com.au": enough to tell two
 * recipients apart in a log, never the full address. */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${address[0]}***${address.slice(at)}`;
}

/** Masks any address inside free text (a provider's error message). */
export function maskEmailsIn(text: string): string {
  return text.replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g, (m) => maskEmail(m));
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

export function emailBackendStatus(): "resend" | "disabled" {
  return missingEmailEnv().length === 0 ? "resend" : "disabled";
}

let client: Resend | null = null;
let clientKey: string | null = null;

function resendFor(apiKey: string): Resend {
  if (!client || clientKey !== apiKey) {
    client = new Resend(apiKey);
    clientKey = apiKey;
  }
  return client;
}

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
  const safeMessage = maskEmailsIn(message);
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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return fail(context, "missing_api_key", "RESEND_API_KEY is not set");
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) return fail(context, "missing_from_address", "RESEND_FROM_EMAIL is not set");

  try {
    const { data, error } = await resendFor(apiKey).emails.send(
      { from, to, subject: input.subject, html: input.html, text: input.text },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    );
    if (error) return fail(context, "provider_error", `${error.name}: ${error.message}`);
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
