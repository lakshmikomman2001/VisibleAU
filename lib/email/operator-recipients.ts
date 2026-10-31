/**
 * URGENT audit #37 (31 Oct), item 2: who operates Vunnara, for alerts
 * that are ours to act on (an engine's account out of credit, a revoked
 * key). There's no separate ops-email variable; this reuses
 * PLATFORM_ADMIN_EMAILS -- the comma-separated platform-admin allowlist
 * lib/auth/platform-admin.ts already reads -- with the same normalising.
 * Unset means nobody (the alert still logs).
 */
export const OPERATOR_EMAIL_ENV = "PLATFORM_ADMIN_EMAILS";

export function operatorRecipients(): string[] {
  const raw = process.env[OPERATOR_EMAIL_ENV];
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        // A bare "@domain" entry is a valid allowlist pattern elsewhere,
        // never a mailbox.
        .filter((e) => /^[^@\s]+@[^@\s]+$/.test(e)),
    ),
  ].sort();
}
