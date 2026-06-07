/**
 * tests/e2e/backend/sprint2/helpers/db.ts
 *
 * Direct DB helpers for Sprint 2 backend E2E tests.
 * Uses the service-role Drizzle client (bypasses RLS) to:
 *   - Seed organizations, users, brands, audits, citations
 *   - Truncate Sprint 2 tables between tests
 *   - Verify DB state after API calls
 *
 * IMPORTANT: These helpers use the service-role DATABASE_URL which bypasses RLS.
 * API calls in the tests use real Clerk JWTs and go through the app's RLS context.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, inArray, sql } from 'drizzle-orm'; // K11 FIX: removed unused 'and' import
import * as schema from '../../../../../db/schema';
import type { Organization, User, Brand, Audit, Citation } from '../../../../../db/schema';

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
export const testDb = drizzle(client, { schema });

// ─── Seed helpers ─────────────────────────────────────────────────────────────

export async function seedOrganization(data: {
  clerkOrgId: string;
  name: string;
  region?: Organization['region'];
  tier?: Organization['tier'];
}): Promise<Organization> {
  const [org] = await testDb
    .insert(schema.organizations)
    .values({
      clerkOrgId: data.clerkOrgId,
      name:       data.name,
      region:     data.region ?? 'au',
      tier:       data.tier   ?? 'agency',
    })
    .onConflictDoNothing()
    .returning();

  if (org) return org;
  // Already exists — fetch it
  const [existing] = await testDb
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, data.clerkOrgId));
  return existing;
}

export async function seedUser(data: {
  clerkUserId: string;
  organizationId: string;
  email: string;
  role?: string;
}): Promise<User> {
  const [user] = await testDb
    .insert(schema.users)
    .values({
      clerkUserId:    data.clerkUserId,
      organizationId: data.organizationId,
      email:          data.email,
      name:           'E2E Test User',
      role:           (data.role ?? 'owner') as User['role'],
    })
    .onConflictDoNothing()
    .returning();

  if (user) return user;
  const [existing] = await testDb
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, data.clerkUserId));
  return existing;
}

export async function seedBrand(data: {
  organizationId: string;
  name: string;
  domain: string;
  vertical?: Brand['vertical'];
}): Promise<Brand> {
  const [brand] = await testDb
    .insert(schema.brands)
    .values({
      organizationId: data.organizationId,
      name:           data.name,
      domain:         data.domain,
      vertical:       data.vertical ?? 'tradies',
      region:         'au',
      competitors:    [],
      primaryRegions: [],
    })
    .returning();
  return brand;
}

export async function seedAudit(data: {
  organizationId: string;
  brandId: string;
  auditNumber: number;
  status?: Audit['status'];
  mockScenario?: string;
  scoreComposite?: string;
  totalCostUsd?: string;
}): Promise<Audit> {
  const [audit] = await testDb
    .insert(schema.audits)
    .values({
      organizationId: data.organizationId,
      brandId:        data.brandId,
      auditNumber:    data.auditNumber,
      triggeredBy:    'manual',
      status:         data.status ?? 'pending',
      engines:        [],
      metadata:       data.mockScenario ? { mockScenario: data.mockScenario } : {},
      scoreComposite: data.scoreComposite ?? null,
      totalCostUsd:   data.totalCostUsd ?? null,
    })
    .returning();
  return audit;
}

// ─── Teardown helpers ──────────────────────────────────────────────────────────

/**
 * Truncate Sprint 2 tables for the given org between tests.
 * Order matters: citations → audits (FK constraint).
 */
export async function truncateSprint2Tables(orgId: string): Promise<void> {
  // Citations are linked via auditId → get auditIds for this org first
  const orgAudits = await testDb
    .select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));

  if (orgAudits.length > 0) {
    const auditIds = orgAudits.map((a) => a.id);
    await testDb
      .delete(schema.citations)
      .where(inArray(schema.citations.auditId, auditIds));
  }

  await testDb
    .delete(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
}

/** Truncate Sprint 2 tables for multiple orgs. */
export async function truncateSprint2TablesForOrgs(orgIds: string[]): Promise<void> {
  for (const orgId of orgIds) {
    await truncateSprint2Tables(orgId);
  }
}

/** Truncate the LLM response cache entirely (safe for tests — it's cross-org). */
export async function truncateLlmCache(): Promise<void> {
  await testDb.delete(schema.llmResponseCache);
}

/** Hard-delete all brands for an org (including soft-deleted). */
export async function deleteBrandsForOrg(orgId: string): Promise<void> {
  await testDb
    .delete(schema.brands)
    .where(eq(schema.brands.organizationId, orgId));
}

// ─── Query helpers ─────────────────────────────────────────────────────────────

export async function getAuditById(id: string): Promise<Audit | null> {
  const [audit] = await testDb
    .select()
    .from(schema.audits)
    .where(eq(schema.audits.id, id));
  return audit ?? null;
}

export async function getCitationsForAudit(auditId: string): Promise<Citation[]> {
  return testDb
    .select()
    .from(schema.citations)
    .where(eq(schema.citations.auditId, auditId));
}

// L17 FIX: countAuditsForOrg removed — exported but never imported by any test file

export async function getMaxAuditNumberForOrg(orgId: string): Promise<number> {
  const [row] = await testDb
    .select({ max: sql<number>`COALESCE(MAX(audit_number), 0)::int` })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
  return row.max;
}

// L16 FIX: getLlmCacheRow removed — exported but never imported by any test file
