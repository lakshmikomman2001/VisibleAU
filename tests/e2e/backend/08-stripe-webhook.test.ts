/**
 * tests/e2e/backend/08-stripe-webhook.test.ts
 *
 * E2E: POST /api/webhooks/stripe
 *
 * Sprint 1 §6: Stripe webhook handler is a stub — it only verifies the
 * Stripe signature. Full event handling comes in Sprint 10.
 *
 * These tests confirm:
 *   1. Unsigned/tampered requests are rejected (400 or 401)
 *   2. Signed requests with a valid test-mode secret are accepted (200)
 *   3. The route exists at the canonical path
 */

import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { postPublic } from "./helpers/http";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test_placeholder";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder";

const stripe = new Stripe(STRIPE_SECRET_KEY);

const WEBHOOK_URL = "/api/webhooks/stripe";

function buildSignedStripePayload(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: STRIPE_WEBHOOK_SECRET,
    timestamp: ts,
  });
  return { body, signature };
}

describe("POST /api/webhooks/stripe", () => {
  it("returns 400 with no Stripe-Signature header", async () => {
    const { status } = await postPublic(
      WEBHOOK_URL,
      { type: "checkout.session.completed" },
      { "Content-Type": "application/json" },
    );
    // Sprint 1 stub: no signature → 400
    expect([400, 401]).toContain(status);
  });

  it("returns 400 with a tampered Stripe-Signature header", async () => {
    const { status } = await postPublic(
      WEBHOOK_URL,
      { type: "checkout.session.completed" },
      {
        "Content-Type": "application/json",
        "Stripe-Signature": "t=12345,v1=invalidsignature",
      },
    );
    expect([400, 401]).toContain(status);
  });

  it("returns 200 with a valid Stripe-Signature (stub — event type not processed)", async () => {
    const payload = {
      id: `evt_test_${Date.now()}`,
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_placeholder" } },
      object: "event",
    };
    const { body, signature } = buildSignedStripePayload(payload);

    // D5 FIX: Stripe handler calls stripe.webhooks.constructEvent(rawBody, sig, secret)
    // which requires the exact bytes that were signed. Send body as rawBody string.
    const { status } = await postPublic(
      WEBHOOK_URL,
      undefined,
      {
        "Content-Type": "application/json",
        "Stripe-Signature": signature,
      },
      body, // rawBody — the exact string that generateTestHeaderString signed
    );

    // Sprint 1 stub: valid signature → 200 (event processing deferred to Sprint 10)
    expect(status).toBe(200);
  });

  it("route exists at canonical path /api/webhooks/stripe", async () => {
    // A GET to the route must not return 404 (confirms route exists)
    const { request } = await import("./helpers/http");
    const { status } = await request(WEBHOOK_URL, { method: "GET" });
    // Method Not Allowed (405) or similar — but not 404
    expect(status).not.toBe(404);
  });
});
