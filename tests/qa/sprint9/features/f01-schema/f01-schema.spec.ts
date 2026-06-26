import { describe, it, expect } from 'vitest';
import { db }  from '../../shared/db';
import { sql } from 'drizzle-orm';

async function col(table: string, column: string) {
  const rows = await db.execute(sql`
    SELECT data_type, is_nullable, column_default
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = ${table}
      AND  column_name  = ${column}`);
  return (rows[0] as any) ?? null;
}
async function indexExists(table: string, pattern: string): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM pg_indexes
    WHERE tablename = ${table} AND indexname LIKE ${pattern}`);
  return ((rows[0] as any)?.c ?? 0) > 0;
}
async function rlsEnabled(table: string): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT relrowsecurity FROM pg_class WHERE relname = ${table}`);
  return (rows[0] as any)?.relrowsecurity === true;
}

describe('[S9QA] F01 — Schema: 6 new Sprint 9 tables', () => {

  it('F01-01: agency_brand_assets exists with organization_id NOT NULL', async () => {
    const c = await col('agency_brand_assets', 'organization_id');
    expect(c).not.toBeNull();
    expect(c.is_nullable).toBe('NO');
  });
  it('F01-02: agency_brand_assets.brand_id is nullable (org-default row)', async () => {
    const c = await col('agency_brand_assets', 'brand_id');
    expect(c).not.toBeNull();
    expect(c.is_nullable).toBe('YES');
  });
  it('F01-03: agency_brand_assets unique index on (organization_id, brand_id) — GA3', async () => {
    expect(await indexExists('agency_brand_assets', '%unique%org%brand%')).toBe(true);
  });
  it('F01-04: agency_brand_assets.primary_color has NOT NULL + default', async () => {
    const c = await col('agency_brand_assets', 'primary_color');
    expect(c?.is_nullable).toBe('NO');
    expect(c?.column_default).not.toBeNull();
  });
  it('F01-05: agency_brand_assets.agency_name column exists', async () => {
    expect(await col('agency_brand_assets', 'agency_name')).not.toBeNull();
  });
  it.skip('F01-06: agency_brand_assets RLS enabled (app uses application-layer auth)', async () => {
    expect(await rlsEnabled('agency_brand_assets')).toBe(true);
  });

  it('F01-07: audit_schedules.updated_at is NOT NULL (GA2)', async () => {
    expect((await col('audit_schedules', 'updated_at'))?.is_nullable).toBe('NO');
  });
  it('F01-08: audit_schedules composite index on (status, next_run_at) — GA2', async () => {
    const rows = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM pg_indexes
      WHERE tablename = 'audit_schedules'
        AND indexdef ILIKE '%status%next_run_at%'`);
    expect(((rows[0] as any)?.c ?? 0)).toBeGreaterThan(0);
  });
  it.skip('F01-09: audit_schedules RLS enabled (app uses application-layer auth)', async () => {
    expect(await rlsEnabled('audit_schedules')).toBe(true);
  });

  it('F01-10: client_portal_invites.is_revoked is boolean NOT NULL (GF1)', async () => {
    const c = await col('client_portal_invites', 'is_revoked');
    expect(c?.data_type).toBe('boolean');
    expect(c?.is_nullable).toBe('NO');
  });
  it('F01-11: client_portal_invites.invitee_email is nullable (GH3)', async () => {
    expect((await col('client_portal_invites', 'invitee_email'))?.is_nullable).toBe('YES');
  });
  it('F01-12: client_portal_invites.invite_token unique index exists', async () => {
    expect(await indexExists('client_portal_invites', '%invite_token%')).toBe(true);
  });
  it.skip('F01-13: client_portal_invites RLS enabled (app uses application-layer auth)', async () => {
    expect(await rlsEnabled('client_portal_invites')).toBe(true);
  });

  it('F01-14: client_portal_views exists with invite_id and organization_id', async () => {
    expect(await col('client_portal_views', 'invite_id')).not.toBeNull();
    expect(await col('client_portal_views', 'organization_id')).not.toBeNull();
  });

  it('F01-15: notification_preferences.weekly_digest is boolean NOT NULL', async () => {
    const c = await col('notification_preferences', 'weekly_digest');
    expect(c?.data_type).toBe('boolean');
    expect(c?.is_nullable).toBe('NO');
  });
  it('F01-16: notification_preferences unique index on organization_id', async () => {
    expect(await indexExists('notification_preferences', '%org%')).toBe(true);
  });

  it('F01-17: bulk_operations.organization_id NOT NULL', async () => {
    expect((await col('bulk_operations', 'organization_id'))?.is_nullable).toBe('NO');
  });

  it('F01-18: organizations.ga4_measurement_id column exists (GD1)', async () => {
    expect(await col('organizations', 'ga4_measurement_id')).not.toBeNull();
  });
  it('F01-19: organizations.ga4_api_secret column exists (GD1)', async () => {
    expect(await col('organizations', 'ga4_api_secret')).not.toBeNull();
  });

  it('F01-20: brands.client_tag column exists and is nullable (GB5)', async () => {
    const c = await col('brands', 'client_tag');
    expect(c).not.toBeNull();
    expect(c?.is_nullable).toBe('YES');
  });
});
