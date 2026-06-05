/**
 * tests/e2e/backend/helpers/db.ts
 *
 * Direct DB helpers for Sprint 1 backend E2E tests.
 * Uses the service-role Drizzle client (bypasses RLS) to seed and clean test data.
 * Tests hit real HTTP endpoints against a running app server.
 */

import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Brand, Organization, User } from "@/db/schema";
import * as schema from "@/db/schema";

// Uses DATABASE_URL from .env.test.local (test Postgres / Supabase test project)
const client = postgres(process.env.DATABASE_URL!, { max: 1 });
export const testDb = drizzle(client, { schema });

// ─── Seed helpers ────────────────────────────────────────────────────────────

export interface SeedOrg {
  clerkOrgId: string;
  name: string;
  region?: Organization["region"];
  tier?: Organization["tier"];
}

/**
 * Insert a real organization row into the test DB.
 * Returns the full inserted Organization row.
 */
export async function seedOrganization(data: SeedOrg): Promise<Organization> {
  const [org] = await testDb
    .insert(schema.organizations)
    .values({
      clerkOrgId: data.clerkOrgId,
      name: data.name,
      region: data.region ?? "au",
      tier: data.tier ?? "free",
    })
    .returning();
  return org;
}

export interface SeedUser {
  clerkUserId: string;
  organizationId: string;
  email: string;
  name?: string;
  role?: string;
}

/**
 * Insert a real user row linked to an org.
 */
export async function seedUser(data: SeedUser): Promise<User> {
  const [user] = await testDb
    .insert(schema.users)
    .values({
      clerkUserId: data.clerkUserId,
      organizationId: data.organizationId,
      email: data.email,
      name: data.name ?? "Test User",
      role: data.role ?? "owner",
    })
    .returning();
  return user;
}

export interface SeedBrand {
  organizationId: string;
  name: string;
  domain: string;
  vertical?: Brand["vertical"];
  region?: Brand["region"];
  competitors?: string[];
  primaryRegions?: string[];
}

/**
 * Insert a real brand row.
 */
export async function seedBrand(data: SeedBrand): Promise<Brand> {
  const [brand] = await testDb
    .insert(schema.brands)
    .values({
      organizationId: data.organizationId,
      name: data.name,
      domain: data.domain,
      vertical: data.vertical ?? "tradies",
      region: data.region ?? "au",
      competitors: data.competitors ?? [],
      primaryRegions: data.primaryRegions ?? [],
    })
    .returning();
  return brand;
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function getBrandById(id: string): Promise<Brand | null> {
  const [brand] = await testDb.select().from(schema.brands).where(eq(schema.brands.id, id));
  return brand ?? null;
}

export async function getActiveBrandsByOrg(orgId: string): Promise<Brand[]> {
  return testDb
    .select()
    .from(schema.brands)
    .where(and(eq(schema.brands.organizationId, orgId), isNull(schema.brands.deletedAt)));
}

export async function getOrgByClerkId(clerkOrgId: string): Promise<Organization | null> {
  const [org] = await testDb
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, clerkOrgId));
  return org ?? null;
}

export async function getUserByClerkId(clerkUserId: string): Promise<User | null> {
  const [user] = await testDb
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkUserId, clerkUserId));
  return user ?? null;
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Truncate all tenant tables in FK-safe order between test runs.
 * Called in beforeEach of each test file.
 */
export async function truncateAll(): Promise<void> {
  await testDb.delete(schema.brands);
  await testDb.delete(schema.users);
  await testDb.delete(schema.organizations);
}
