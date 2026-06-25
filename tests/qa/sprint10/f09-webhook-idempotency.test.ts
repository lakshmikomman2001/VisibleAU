import { describe, it, expect, afterAll } from 'vitest';
import { db, schema }         from './shared/db';
import { cleanupWebhookEvent } from './shared/seed';
import { eq }                 from 'drizzle-orm';

const TS   = Date.now();
const EVT_A = `evt_s10qa_f09_A_${TS}`;
const EVT_B = `evt_s10qa_f09_B_${TS}`;
const EVT_R = `evt_s10qa_f09_race_${TS}`;

afterAll(async () => {
  for (const id of [EVT_A, EVT_B, EVT_R]) {
    await cleanupWebhookEvent(id);
  }
});

describe('F09: Webhook idempotency (HJ3 — UNIQUE race guard)', () => {

  it('F09-01: first insert of stripe_event_id succeeds', async () => {
    const [row] = await db.insert(schema.processedWebhookEvents)
      .values({ stripeEventId: EVT_A, type: 'checkout.session.completed' })
      .returning();
    expect(row.stripeEventId).toBe(EVT_A);
    expect(row.processedAt).toBeInstanceOf(Date);
  });

  it('F09-02: duplicate stripe_event_id throws UNIQUE violation (HJ3)', async () => {
    await expect(
      db.insert(schema.processedWebhookEvents)
        .values({ stripeEventId: EVT_A, type: 'checkout.session.completed' })
    ).rejects.toThrow();
  });

  it('F09-03: exactly one row after duplicate attempt', async () => {
    const rows = await db.select().from(schema.processedWebhookEvents)
      .where(eq(schema.processedWebhookEvents.stripeEventId, EVT_A));
    expect(rows.length).toBe(1);
  });

  it('F09-04: different event IDs can both be inserted', async () => {
    const [row] = await db.insert(schema.processedWebhookEvents)
      .values({ stripeEventId: EVT_B, type: 'invoice.paid' })
      .returning();
    expect(row.stripeEventId).toBe(EVT_B);
  });

  it('F09-05: two concurrent inserts — exactly ONE survives (race condition)', async () => {
    const results = await Promise.allSettled([
      db.insert(schema.processedWebhookEvents)
        .values({ stripeEventId: EVT_R, type: 'customer.subscription.updated' }),
      db.insert(schema.processedWebhookEvents)
        .values({ stripeEventId: EVT_R, type: 'customer.subscription.updated' }),
    ]);
    const ok   = results.filter(r => r.status === 'fulfilled');
    const fail = results.filter(r => r.status === 'rejected');
    expect(ok.length).toBe(1);
    expect(fail.length).toBe(1);
    const rows = await db.select().from(schema.processedWebhookEvents)
      .where(eq(schema.processedWebhookEvents.stripeEventId, EVT_R));
    expect(rows.length).toBe(1);
  });

  it('F09-06: processedAt is a Date instance', async () => {
    const [row] = await db.select({ pa: schema.processedWebhookEvents.processedAt })
      .from(schema.processedWebhookEvents)
      .where(eq(schema.processedWebhookEvents.stripeEventId, EVT_A));
    expect(row.pa).toBeInstanceOf(Date);
  });

  it('F09-07: findFirst idempotency check mirrors route handler pattern', async () => {
    const existing = await db.query.processedWebhookEvents.findFirst({
      where: eq(schema.processedWebhookEvents.stripeEventId, EVT_A),
    });
    expect(existing).toBeTruthy();
    expect(existing?.stripeEventId).toBe(EVT_A);
  });
});
