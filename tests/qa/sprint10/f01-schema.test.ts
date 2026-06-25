import { describe, it, expect } from 'vitest';
import { db, schema }           from './shared/db';
import { sql }                  from 'drizzle-orm';

async function col(table: string, column: string) {
  const [r] = await db.execute(sql`
    SELECT data_type, is_nullable, column_default
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = ${table}
      AND  column_name  = ${column}
  `);
  return r as { data_type: string; is_nullable: string; column_default: string } | undefined;
}

async function uniqueExists(table: string, column: string): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN   information_schema.constraint_column_usage ccu
      ON   tc.constraint_name = ccu.constraint_name
    WHERE  tc.table_schema   = 'public'
      AND  tc.table_name     = ${table}
      AND  tc.constraint_type = 'UNIQUE'
      AND  ccu.column_name   = ${column}
  `);
  return rows.length > 0;
}

describe('F01: Sprint 10 schema (HA1, HA2, HE5)', () => {
  it('F01-01: subscriptions table exists', async () => {
    const rows = await db.execute(sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'subscriptions'
    `);
    expect(rows.length).toBe(1);
  });

  it('F01-02: cancelAtPeriodEnd is boolean NOT NULL (HA1)', async () => {
    const c = await col('subscriptions', 'cancel_at_period_end');
    expect(c?.data_type).toBe('boolean');
    expect(c?.is_nullable).toBe('NO');
  });

  it('F01-03: stripe_subscription_id has UNIQUE constraint', async () => {
    expect(await uniqueExists('subscriptions', 'stripe_subscription_id')).toBe(true);
  });

  it('F01-04: organization_id has UNIQUE constraint (one active sub per org)', async () => {
    expect(await uniqueExists('subscriptions', 'organization_id')).toBe(true);
  });

  it('F01-05: subscriptions.metadata is jsonb NOT NULL', async () => {
    const c = await col('subscriptions', 'metadata');
    expect(c?.data_type).toBe('jsonb');
    expect(c?.is_nullable).toBe('NO');
  });

  it('F01-06: processed_webhook_events table exists', async () => {
    const rows = await db.execute(sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'processed_webhook_events'
    `);
    expect(rows.length).toBe(1);
  });

  it('F01-07: stripe_event_id has UNIQUE constraint (HJ3 race guard)', async () => {
    expect(await uniqueExists('processed_webhook_events', 'stripe_event_id')).toBe(true);
  });

  it('F01-08: organizations.metadata is jsonb NOT NULL', async () => {
    const c = await col('organizations', 'metadata');
    expect(c?.data_type).toBe('jsonb');
    expect(c?.is_nullable).toBe('NO');
  });

  it('F01-09: organizations.slug is nullable text with UNIQUE constraint', async () => {
    const c = await col('organizations', 'slug');
    expect(c?.data_type).toBe('text');
    expect(c?.is_nullable).toBe('YES');
    expect(await uniqueExists('organizations', 'slug')).toBe(true);
  });

  it('F01-10: organizations.onboarding_complete is boolean NOT NULL', async () => {
    const c = await col('organizations', 'onboarding_complete');
    expect(c?.data_type).toBe('boolean');
    expect(c?.is_nullable).toBe('NO');
  });

  it('F01-11: schema.subscriptions is exported from barrel (HA2)', () => {
    expect(schema.subscriptions).toBeDefined();
    expect(typeof schema.subscriptions).toBe('object');
  });

  it('F01-12: schema.processedWebhookEvents is exported from barrel (HA2)', () => {
    expect(schema.processedWebhookEvents).toBeDefined();
    expect(typeof schema.processedWebhookEvents).toBe('object');
  });
});
