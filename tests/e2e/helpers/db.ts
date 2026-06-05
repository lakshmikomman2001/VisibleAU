/**
 * tests/e2e/helpers/db.ts
 *
 * Direct DB access for frontend E2E tests.
 * Uses the service-role postgres client (bypasses RLS) for:
 *   - Seeding test organisations + users before tests
 *   - Teardown: hard-deleting test-created brands after each test
 *
 * Why direct DB in a frontend E2E suite?
 *   The test users (USER_1, USER_2) already exist in Clerk test-mode.
 *   Their org + user rows must exist in the DB BEFORE the browser test runs
 *   (otherwise getCurrentUser() returns null → /sign-in redirect).
 *   We seed these rows directly rather than relying on Clerk webhooks
 *   (webhooks are asynchronous and may not have fired yet in CI).
 *
 * Brand teardown:
 *   Brands created during tests are tracked and hard-deleted via the DB
 *   after each spec. The app soft-deletes; we hard-delete in teardown
 *   so the DB stays clean between runs.
 */

import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Brand, Organization, User } from "@/db/schema";
import * as schema from "@/db/schema";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(client, { schema });

// ─── Seed helpers ─────────────────────────────────────────────────────────────

export async function ensureOrganization(opts: {
  clerkOrgId: string;
  name: string;
  region?: Organization["region"];
  tier?: Organization["tier"];
}): Promise<Organization> {
  // Upsert — idempotent so re-runs don't fail on unique constraint
  const [existing] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, opts.clerkOrgId));

  if (existing) return existing;

  const [org] = await db
    .insert(schema.organizations)
    .values({
      clerkOrgId: opts.clerkOrgId,
      name: opts.name,
      region: opts.region ?? "au",
      tier: opts.tier ?? "free",
    })
    .returning();
  return org;
}

export async function ensureUser(opts: {
  clerkUserId: string;
  organizationId: string;
  email: string;
  name?: string;
}): Promise<User> {
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, opts.clerkUserId));

  if (existing) return existing;

  const [user] = await db
    .insert(schema.users)
    .values({
      clerkUserId: opts.clerkUserId,
      organizationId: opts.organizationId,
      email: opts.email,
      name: opts.name ?? "E2E User",
      role: "owner",
    })
    .returning();
  return user;
}

// ─── Teardown helpers ─────────────────────────────────────────────────────────

/**
 * Hard-delete brands created during a test by their IDs.
 * Runs after each test spec to leave the DB clean.
 * The app soft-deletes (sets deletedAt); teardown does a real DELETE
 * so repeat test runs start from a clean state.
 */
export async function deleteBrandsByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(schema.brands).where(inArray(schema.brands.id, ids));
}

/**
 * Delete all non-deleted brands belonging to an org.
 * Used in afterAll to guarantee clean state for the org.
 */
export async function deleteAllBrandsForOrg(orgId: string): Promise<void> {
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));
}

/**
 * Look up an org row by Clerk org ID.
 */
export async function getOrgByClerkId(clerkOrgId: string): Promise<Organization | null> {
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, clerkOrgId));
  return org ?? null;
}

/**
 * Look up a brand by its UUID.
 * Returns null if not found (deleted or never existed).
 */
export async function getBrandById(id: string): Promise<Brand | null> {
  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, id));
  return brand ?? null;
}

// D11 FIX: countActiveBrands was exported but never imported by any test file (dead export).
// Also used and() with a single argument and filtered soft-deletes in JS rather than SQL.
// Removed — use getBrandById() or query db directly in tests that need active brand counts.
