import { APIError, createAuthMiddleware } from "better-auth/api";
import { after } from "next/server";
import { maskEmailsIn, sendEmail } from "@/lib/email/send";
import { emailVerificationEmail, passwordResetEmail } from "@/lib/email/templates/auth";
import { checkPostgresRateLimit } from "@/lib/governance/pg-rate-limit";

/**
 * Password reset and email verification, wired into better-auth's own
 * callbacks (lib/auth/server.ts). better-auth makes the token, the link
 * (from BETTER_AUTH_URL) and the expiry; these only send the email.
 */

/** better-auth's default reset-token lifetime, set explicitly in
 * lib/auth/server.ts so the email can say how long the link works. */
export const RESET_PASSWORD_TOKEN_SECONDS = 60 * 60;

/**
 * A failed send is logged (lib/email/send.ts) and NOT thrown: throwing
 * would turn the reset response into an error only for addresses that
 * have an account -- the one thing that response must never reveal.
 */
export async function sendPasswordResetEmail({
  user,
  url,
}: {
  user: { email: string };
  url: string;
}): Promise<void> {
  await sendEmail({
    to: user.email,
    ...passwordResetEmail({ url, expiresInMinutes: RESET_PASSWORD_TOKEN_SECONDS / 60 }),
    category: "password_reset",
  });
}

export async function sendVerificationEmailMessage({
  user,
  url,
}: {
  user: { email: string };
  url: string;
}): Promise<void> {
  await sendEmail({
    to: user.email,
    ...emailVerificationEmail({ url }),
    category: "email_verification",
  });
}

/** Per address and per IP, through the Postgres limiter that already
 * guards the sample audit (lib/governance/pg-rate-limit.ts). The same
 * limit applies whether or not the address has an account. */
export const AUTH_EMAIL_LIMITS = {
  perAddress: { max: 3, windowMs: 60 * 60 * 1000 },
  perIp: { max: 10, windowMs: 60 * 60 * 1000 },
} as const;

const RATE_LIMITED_PATHS = new Set(["/request-password-reset", "/send-verification-email"]);

function emailFrom(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("email" in body)) return null;
  return typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
}

export const authEmailRateLimit = createAuthMiddleware(async (ctx) => {
  if (!RATE_LIMITED_PATHS.has(ctx.path)) return;
  const ip = ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const address = emailFrom(ctx.body);
  const checks = [
    checkPostgresRateLimit({
      routeKey: `auth-email-ip${ctx.path}`,
      ip,
      ...AUTH_EMAIL_LIMITS.perIp,
    }),
  ];
  if (address) {
    // Hashed like an IP before it's stored (pg-rate-limit.ts's hashIp).
    checks.push(
      checkPostgresRateLimit({
        routeKey: `auth-email-address${ctx.path}`,
        ip: `email:${address}`,
        ...AUTH_EMAIL_LIMITS.perAddress,
      }),
    );
  }
  const results = await Promise.all(checks);
  if (results.some((r) => !r.allowed)) {
    console.warn(JSON.stringify({ event: "auth_email_rate_limited", path: ctx.path }));
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "Too many requests. Please try again in an hour.",
    });
  }
});

/**
 * better-auth's backgroundTasks handler: the reset email is sent after
 * the response, so an address with an account doesn't answer more
 * slowly than one without. Outside a request (a script, a test) after()
 * throws; the send is already running, so it just finishes on its own.
 */
export function runAfterResponse(promise: Promise<unknown>): void {
  try {
    after(() => promise);
  } catch {
    // Not inside a request -- nothing to keep alive.
  }
}

/** better-auth's own log lines, with any address masked (it logs the
 * address on "Reset Password: User not found"). */
export function logAuthMessage(level: string, message: string, ...args: unknown[]): void {
  const detail = args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
  const line = maskEmailsIn(`[better-auth] ${message}${detail ? ` ${detail}` : ""}`);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
