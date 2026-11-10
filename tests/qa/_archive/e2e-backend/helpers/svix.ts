/**
 * tests/e2e/backend/helpers/svix.ts
 *
 * Generates real Svix webhook signatures for Clerk webhook E2E tests.
 *
 * C6 FIX (previous pass): use new Date() directly for Webhook.sign() timestamp.
 *
 * D5 FIX (this pass): signWebhook() now returns { rawBody, headers }.
 * The HMAC is computed over the exact rawBody bytes. Callers MUST send rawBody
 * directly — NOT re-parse it to JSON and re-stringify, as that can change
 * whitespace/ordering and break the HMAC signature verification.
 *
 * Use: postPublic(url, undefined, headers, rawBody)
 */

import { Webhook } from "svix";

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET ?? "whsec_test_placeholder";

/**
 * Sign a Clerk webhook payload.
 * Returns { rawBody, headers } where rawBody is the exact bytes that were signed.
 * Callers must send rawBody verbatim to the webhook handler.
 */
export function signWebhook(
  payload: Record<string, unknown>,
  eventType: string,
): { rawBody: string; headers: Record<string, string> } {
  const wh = new Webhook(WEBHOOK_SECRET);

  // rawBody is the exact string the HMAC is computed over.
  // D5 FIX: never JSON.parse(rawBody) before sending — that changes bytes and breaks signature.
  const rawBody = JSON.stringify({ ...payload, type: eventType });
  const msgId = `msg_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date(); // C6 FIX: use Date directly

  const signature = wh.sign(msgId, now, rawBody);

  return {
    rawBody,
    headers: {
      "Content-Type": "application/json",
      "svix-id": msgId,
      "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
      "svix-signature": signature,
    },
  };
}

// ─── Payload builders ─────────────────────────────────────────────────────────

export function orgCreatedPayload(overrides: {
  clerkOrgId: string;
  name: string;
  region?: string;
  tier?: string;
}): Record<string, unknown> {
  return {
    data: {
      id: overrides.clerkOrgId,
      name: overrides.name,
      public_metadata: {
        region: overrides.region ?? "au",
        tier: overrides.tier ?? "free",
      },
      private_metadata: {},
      created_at: Date.now(),
    },
    object: "event",
  };
}

export function orgUpdatedPayload(clerkOrgId: string, name: string): Record<string, unknown> {
  return {
    data: { id: clerkOrgId, name, created_at: Date.now() },
    object: "event",
  };
}

export function orgDeletedPayload(clerkOrgId: string): Record<string, unknown> {
  return {
    data: { id: clerkOrgId, deleted: true },
    object: "event",
  };
}

export function membershipCreatedPayload(overrides: {
  clerkUserId: string;
  clerkOrgId: string;
  email: string;
  name?: string;
}): Record<string, unknown> {
  return {
    data: {
      id: `mem_${Date.now()}`,
      organization: { id: overrides.clerkOrgId },
      public_user_data: {
        user_id: overrides.clerkUserId,
        email_addresses: [{ email_address: overrides.email }],
        first_name: overrides.name ?? "Test",
        last_name: "User",
      },
      created_at: Date.now(),
    },
    object: "event",
  };
}

export function membershipDeletedPayload(
  clerkUserId: string,
  clerkOrgId: string,
): Record<string, unknown> {
  return {
    data: {
      id: `mem_${Date.now()}`,
      organization: { id: clerkOrgId },
      public_user_data: { user_id: clerkUserId },
    },
    object: "event",
  };
}

export function userDeletedPayload(clerkUserId: string): Record<string, unknown> {
  return {
    data: { id: clerkUserId, deleted: true },
    object: "event",
  };
}
