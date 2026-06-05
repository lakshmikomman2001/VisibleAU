/**
 * tests/e2e/backend/sprint5/helpers/db.ts
 *
 * Service-role Drizzle client + seed/teardown helpers for Sprint 5 backend E2E.
 *
 * Sprint 5 adds vertical_packs and vertical_pack_prompts tables.
 * These helpers insert MINIMAL test rows (not the full 336-prompt production seed).
 * Production seed counts are verified separately in 03-schema-seed-verification.test.ts.
 *
 * All test rows use name prefix '[S5-E2E]' and are hard-deleted in afterAll.
 *
 * ── REGION STRATEGY ──────────────────────────────────────────────────────────
 * vertical_packs.region uses regionEnum: 'au' | 'nz' | 'uk' | 'us' | 'ca' | 'eu'
 * Production packs always use region='au'. Test packs use 'nz' or 'uk' so they:
 *   (a) satisfy the Postgres enum constraint, and
 *   (b) never collide with production (vertical, region) unique index.
 * Do NOT use region='test', 'test-*', or any other non-enum value — Postgres
 * will throw "invalid input value for enum region" on every INSERT or comparison.
 */

import { drizzle }                        from 'drizzle-orm/postgres-js';
import postgres                            from 'postgres';
import { eq, and, isNull, sql, inArray }  from 'drizzle-orm';
import * as schema                         from '../../../../../db/schema';
import type {
  Organization, User, Brand,
  VerticalPack, VerticalPackPrompt,
} from '../../../../../db/schema';

// ─── DB client ───────────────────────────────────────────────────────────────

const pgClient = postgres(process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(pgClient, { schema });

// ─── Org / user (idempotent) ──────────────────────────────────────────────────

export async function seedOrganization(data: {
  clerkOrgId: string;
  name:        string;
  tier?:       Organization['tier'];
}): Promise<Organization> {
  const [existing] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, data.clerkOrgId));
  if (existing) return existing;
  const [org] = await db
    .insert(schema.organizations)
    .values({ clerkOrgId: data.clerkOrgId, name: data.name, region: 'au', tier: data.tier ?? 'agency' })
    .returning();
  return org;
}

export async function seedUser(data: {
  clerkUserId:    string;
  organizationId: string;
  email:          string;
}): Promise<User> {
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, data.clerkUserId));
  if (existing) return existing;
  const [user] = await db
    .insert(schema.users)
    .values({ clerkUserId: data.clerkUserId, organizationId: data.organizationId, email: data.email, name: 'S5 E2E User', role: 'owner' })
    .returning();
  return user;
}

// ─── Brand ───────────────────────────────────────────────────────────────────

export async function seedBrand(data: {
  organizationId: string;
  vertical:       Brand['vertical'];
  primaryRegions?: string[];
}): Promise<Brand> {
  const [brand] = await db
    .insert(schema.brands)
    .values({
      organizationId: data.organizationId,
      name:           '[S5-E2E] Test Brand',
      domain:         'e2e-s5.test',
      vertical:       data.vertical,
      region:         'au',
      primaryRegions: data.primaryRegions ?? ['NSW:Sydney CBD'],
      competitors:    ['Eastern Rival Co'],
    })
    .returning();
  return brand;
}

// ─── Vertical pack (test-only, minimal) ──────────────────────────────────────

/**
 * Insert a minimal test vertical pack using a valid regionEnum value.
 *
 * MUST use a valid regionEnum value: 'au' | 'nz' | 'uk' | 'us' | 'ca' | 'eu'
 * Default region is 'nz' — production packs only use 'au', so 'nz' never
 * conflicts with the UNIQUE(vertical, region) index on production data.
 *
 * Each caller must choose a (vertical, region) pair that is unique at the time
 * the pack is live. Tests that clean up inline (via pack.id) may reuse the
 * same pair in a later test since the constraint is released after deletion.
 */
export async function seedTestVerticalPack(data: {
  vertical?: string;
  region?:   string;
  name?:     string;
  prompts?:  Array<{
    promptTemplate:       string;
    rank:                 number;
    category?:            string;
    expectedMentionType?: string;
  }>;
}): Promise<{ pack: VerticalPack; prompts: VerticalPackPrompt[] }> {
  const vertical = data.vertical ?? 'tradies';
  const region   = data.region   ?? 'nz';   // 'nz': valid enum, no production conflicts
  const name     = data.name     ?? '[S5-E2E] Test Pack';

  // Insert pack — ON CONFLICT update (handles re-runs without unique violation)
  const [pack] = await db
    .insert(schema.verticalPacks)
    .values({
      vertical: vertical as any,
      region:   region   as any,
      name,
      version:      'v0.test',
      promptsCount: 0,
      metadata:     { author: 'e2e-test', source: 'automated-test' },
      updatedAt:    new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.verticalPacks.vertical, schema.verticalPacks.region],
      set:    { name, updatedAt: new Date(), promptsCount: 0 },
    })
    .returning();

  // Delete existing prompts for this test pack (idempotent)
  await db.delete(schema.verticalPackPrompts).where(eq(schema.verticalPackPrompts.packId, pack.id));

  // Insert test prompts
  const defaultPrompts = data.prompts ?? [
    { promptTemplate: 'Who are the best plumbers in {location}?', rank: 1, category: 'service-discovery', expectedMentionType: 'recommended' },
    { promptTemplate: 'I need an emergency electrician near {location}. Who should I call?', rank: 2, category: 'emergency', expectedMentionType: 'recommended' },
    { promptTemplate: '{brand} vs {competitors} — which is better for hot water installation?', rank: 3, category: 'comparison', expectedMentionType: 'comparison' },
    { promptTemplate: 'How much does a licensed plumber cost in {location}?', rank: 4, category: 'pricing', expectedMentionType: 'listed' },
    { promptTemplate: 'Best-reviewed tradies in {location}?', rank: 5, category: 'reviews', expectedMentionType: 'listed' },
  ];

  let insertedPrompts: VerticalPackPrompt[] = [];
  if (defaultPrompts.length > 0) {
    insertedPrompts = await db
      .insert(schema.verticalPackPrompts)
      .values(defaultPrompts.map(p => ({ packId: pack.id, ...p })))
      .returning();
  }

  // Update promptsCount
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.verticalPackPrompts)
    .where(eq(schema.verticalPackPrompts.packId, pack.id));
  const [updatedPack] = await db
    .update(schema.verticalPacks)
    .set({ promptsCount: count })
    .where(eq(schema.verticalPacks.id, pack.id))
    .returning();

  return { pack: updatedPack, prompts: insertedPrompts };
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

/**
 * Hard-delete all test vertical packs with name starting '[S5-E2E]'.
 * CASCADE on verticalPackPrompts means prompts are also deleted.
 */
export async function deleteTestVerticalPacks(): Promise<void> {
  await db
    .delete(schema.verticalPacks)
    .where(sql`name LIKE '[S5-E2E]%'`);
}

/**
 * Hard-delete test brands and related audits/citations for a given org.
 */
export async function deleteTestDataForOrg(orgId: string): Promise<void> {
  if (!orgId) return;
  const auditIds = await db
    .select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
  if (auditIds.length > 0) {
    await db.delete(schema.citations).where(inArray(schema.citations.auditId, auditIds.map(a => a.id)));
  }
  await db.delete(schema.audits).where(eq(schema.audits.organizationId, orgId));
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function getProductionPack(vertical: string, region = 'au'): Promise<VerticalPack | null> {
  const [pack] = await db
    .select()
    .from(schema.verticalPacks)
    .where(
      and(
        eq(schema.verticalPacks.vertical, vertical as any),
        eq(schema.verticalPacks.region, region as any),
        isNull(schema.verticalPacks.retiredAt),
      )
    );
  return pack ?? null;
}

export async function getPromptCountForPack(packId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.verticalPackPrompts)
    .where(eq(schema.verticalPackPrompts.packId, packId));
  return count;
}
