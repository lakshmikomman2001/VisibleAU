/**
 * tests/e2e/frontend/sprint5/helpers/db.ts
 *
 * Drizzle-based seed and teardown helpers for the Sprint 5 frontend E2E suite.
 * Uses a service-role Postgres connection that bypasses RLS — the same pattern
 * as the backend E2E helpers.
 *
 * ALL test data is created with the '[FE-S5]' name prefix so deleteTestData()
 * can sweep any orphaned rows left by a crashed test run.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../../../../db/schema';
import { eq, isNull, and, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// DB client — service-role, bypasses RLS (intentional for test seed/teardown)
// ---------------------------------------------------------------------------

const pgClient = postgres(process.env.DATABASE_URL!, {
  max: 3,
  onnotice: () => {},   // silence migration notices
});
export const db = drizzle(pgClient, { schema });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeedOrgInput {
  clerkOrgId: string;
  name?: string;
  tier?: 'free' | 'starter' | 'growth' | 'agency' | 'agency_pro' | 'enterprise';
}

interface SeedUserInput {
  clerkUserId: string;
  organizationId: string;
  email: string;
}

interface SeedBrandInput {
  organizationId: string;
  name: string;
  domain: string;
  vertical: 'tradies' | 'allied_health' | 'saas';
  region?: 'au' | 'nz' | 'uk' | 'us';
  primaryRegions?: string[];
  competitors?: string[];
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

/**
 * Upsert a test organisation. Returns the existing row if clerkOrgId already
 * exists — safe to call in multiple beforeAll hooks that share the same test org.
 */
export async function seedOrganization(data: SeedOrgInput) {
  const existing = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, data.clerkOrgId))
    .limit(1);

  if (existing[0]) return existing[0];

  const [org] = await db
    .insert(schema.organizations)
    .values({
      clerkOrgId: data.clerkOrgId,
      name:       data.name ?? '[FE-S5] Test Organisation',
      region:     'au',
      tier:       data.tier ?? 'agency',
    })
    .returning();

  return org;
}

/**
 * Upsert a test user. Returns the existing row if clerkUserId already exists.
 */
export async function seedUser(data: SeedUserInput) {
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, data.clerkUserId))
    .limit(1);

  if (existing[0]) return existing[0];

  const [user] = await db
    .insert(schema.users)
    .values({
      clerkUserId:    data.clerkUserId,
      organizationId: data.organizationId,
      email:          data.email,
      name:           '[FE-S5] E2E User',
      role:           'owner',
    })
    .returning();

  return user;
}

/**
 * Insert a test brand. Always creates a new row — each test file seeds fresh.
 * Name must start with '[FE-S5]' for orphan cleanup to work.
 */
export async function seedBrand(data: SeedBrandInput) {
  const [brand] = await db
    .insert(schema.brands)
    .values({
      organizationId: data.organizationId,
      name:           data.name.startsWith('[FE-S5]') ? data.name : `[FE-S5] ${data.name}`,
      domain:         data.domain,
      vertical:       data.vertical as any,
      region:         (data.region ?? 'au') as any,
      primaryRegions: data.primaryRegions ?? ['NSW:Bondi'],
      competitors:    data.competitors ?? [],
    })
    .returning();

  return brand;
}

/**
 * Hard-delete all test data for a given organisation:
 *   citations → audits → brands
 * The org and user rows are left in place (idempotent across multiple test files).
 */
export async function deleteTestDataForOrg(orgId: string): Promise<void> {
  if (!orgId) return;

  // Delete citations that belong to audits for this org
  const auditIds = await db
    .select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));

  if (auditIds.length > 0) {
    await db
      .delete(schema.citations)
      .where(
        sql`${schema.citations.auditId} IN (${sql.join(auditIds.map(a => sql`${a.id}`), sql`, `)})`,
      );
  }

  await db.delete(schema.audits).where(eq(schema.audits.organizationId, orgId));
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));
}

// ---------------------------------------------------------------------------
// Production pack lookup (resolves UUID at runtime — never hardcode)
// ---------------------------------------------------------------------------

/**
 * Returns the active production pack for the given vertical (region='au').
 * Used to resolve the UUID for navigation to /verticals/[packId].
 * Returns null if the seed has not been run.
 */
export async function getProductionPack(vertical: 'tradies' | 'allied_health' | 'saas') {
  const [pack] = await db
    .select()
    .from(schema.verticalPacks)
    .where(
      and(
        eq(schema.verticalPacks.vertical, vertical as any),
        eq(schema.verticalPacks.region, 'au' as any),
        isNull(schema.verticalPacks.retiredAt),
      ),
    )
    .limit(1);

  return pack ?? null;
}

/**
 * Returns all three active production packs. Used by browser tests that need
 * to assert the full list visible on /verticals.
 */
export async function getActiveProductionPacks() {
  return db
    .select()
    .from(schema.verticalPacks)
    .where(
      and(
        eq(schema.verticalPacks.region, 'au' as any),
        isNull(schema.verticalPacks.retiredAt),
      ),
    );
}

// ---------------------------------------------------------------------------
// Orphan cleanup — safety net if a test crashes before afterEach runs
// ---------------------------------------------------------------------------

/**
 * Deletes any lingering '[FE-S5]' branded rows across all test organisations.
 * Call from global afterAll or in beforeAll at the start of each file.
 */
export async function deleteAllFrontendTestBrands(): Promise<void> {
  await db.execute(
    sql`DELETE FROM brands WHERE name LIKE '[FE-S5]%'`,
  );
}
