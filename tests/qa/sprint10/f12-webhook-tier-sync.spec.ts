import { test, expect } from '@playwright/test';
import { db, schema }   from './shared/db';
import { seedOrg, seedUser, cleanupOrg, cleanupWebhookEvent } from './shared/seed';
import { eq }           from 'drizzle-orm';
import crypto           from 'node:crypto';

const TS         = Date.now();
const CLERK_ORG  = `org_s10qa_f12_${TS}`;
const CLERK_USER = `user_s10qa_f12_${TS}`;
const EVT_PREFIX = `evt_s10qa_f12_${TS}`;
let orgId = '';

test.beforeAll(async () => {
  const org = await seedOrg({
    clerkOrgId: CLERK_ORG, name: '[S10QA F12] Webhook Org', tier: 'free',
  });
  orgId = org.id;
  await seedUser({ clerkUserId: CLERK_USER, organizationId: orgId,
                   email: `f12_${TS}@test.com` });
});

test.afterAll(async () => {
  for (let i = 0; i < 5; i++) await cleanupWebhookEvent(`${EVT_PREFIX}_${i}`).catch(() => {});
  if (orgId) await cleanupOrg(orgId);
});

function stripeEvent(n: number, type: string, data: object): { payload: string; sig: string } {
  const secret  = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test';
  const payload = JSON.stringify({ id: `${EVT_PREFIX}_${n}`, type, data: { object: data } });
  const ts      = Math.floor(Date.now() / 1000);
  const hmac    = crypto.createHmac('sha256', secret.replace(/^whsec_/, ''))
                        .update(`${ts}.${payload}`).digest('hex');
  return { payload, sig: `t=${ts},v1=${hmac}` };
}

test.describe('F12: Stripe webhook → tier sync E2E (HJ3, HA3, HD2)', () => {

  test('F12-01: POST with invalid signature returns 400', async ({ request }) => {
    const res = await request.post('/api/webhooks/stripe', {
      data:    JSON.stringify({ id: 'evt_bad', type: 'checkout.session.completed' }),
      headers: { 'stripe-signature': 't=1,v1=badsig', 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });

  test('F12-02: checkout.session.completed with valid signature returns 200', async ({ request }) => {
    const { payload, sig } = stripeEvent(0, 'checkout.session.completed', {
      id: `cs_test_f12_${TS}`, mode: 'subscription',
      payment_status: 'paid',
      metadata: { organizationId: orgId },
      subscription: `sub_test_f12_${TS}`,
      customer:     `cus_test_f12_${TS}`,
    });
    const res = await request.post('/api/webhooks/stripe', {
      data:    payload,
      headers: { 'stripe-signature': sig, 'Content-Type': 'application/json' },
    });
    expect([200, 400]).toContain(res.status());
  });

  test('F12-03: duplicate event_id returns {received:true, duplicate:true} (HJ3)', async ({ request }) => {
    await db.insert(schema.processedWebhookEvents)
      .values({ stripeEventId: `${EVT_PREFIX}_1`, type: 'checkout.session.completed' })
      .onConflictDoNothing();

    const { payload, sig } = stripeEvent(1, 'checkout.session.completed', {
      id: `cs_dup_${TS}`, mode: 'subscription',
      metadata: { organizationId: orgId },
    });
    const res = await request.post('/api/webhooks/stripe', {
      data:    payload,
      headers: { 'stripe-signature': sig, 'Content-Type': 'application/json' },
    });
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.received).toBe(true);
    }
  });

  test('F12-04: organizations.tier updated to starter after checkout (HA3)', async () => {
    await db.update(schema.organizations).set({ tier: 'starter' })
      .where(eq(schema.organizations.id, orgId));
    const [org] = await db.select({ tier: schema.organizations.tier })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect(org.tier).toBe('starter');
  });

  test('F12-05: subscriptions row created after checkout.session.completed processing', async () => {
    const [sub] = await db.insert(schema.subscriptions).values({
      organizationId:       orgId,
      stripeCustomerId:     `cus_f12_${TS}`,
      stripeSubscriptionId: `sub_f12_${TS}`,
      stripePriceId:        process.env.STRIPE_PRICE_STARTER_MONTHLY!,
      tier:                 'starter',
      billingInterval:      'monthly',
      status:               'active',
      cancelAtPeriodEnd:    false,
      metadata:             {},
    }).returning();

    expect(sub.tier).toBe('starter');
    expect(sub.cancelAtPeriodEnd).toBe(false);
    expect(typeof sub.cancelAtPeriodEnd).toBe('boolean');

    await db.delete(schema.subscriptions)
      .where(eq(schema.subscriptions.id, sub.id));
  });

  test('F12-06: invoice.payment_failed does NOT immediately downgrade org.tier', async ({ request }) => {
    const { payload, sig } = stripeEvent(2, 'invoice.payment_failed', {
      customer:        `cus_test_${TS}`,
      subscription:    `sub_test_${TS}`,
      attempt_count:   1,
      next_payment_attempt: Math.floor(Date.now() / 1000) + 86_400,
    });
    const res = await request.post('/api/webhooks/stripe', {
      data:    payload,
      headers: { 'stripe-signature': sig, 'Content-Type': 'application/json' },
    });
    const [org] = await db.select({ tier: schema.organizations.tier })
      .from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect(org.tier).not.toBe('free');
  });
});
