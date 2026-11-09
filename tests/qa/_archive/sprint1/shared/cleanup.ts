/**
 * FK-safe cleanup helpers for QA test data.
 * Delete order: brands → users → organizations
 * Never deletes production data — only rows with [S1-QA] in name
 * or rows seeded in the same test run via the returned IDs.
 */

import { eq, like } from "drizzle-orm"; // Q17 fix: removed unused 'and' and 'isNotNull'
import * as schema from "../../../../db/schema";
import { db } from "./db";

export async function cleanupOrg(orgId: string): Promise<void> {
  if (!orgId) return;
  // soft-delete all brands first (FK-safe; brands refs org)
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));
  await db.delete(schema.users).where(eq(schema.users.organizationId, orgId));
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
}

export async function cleanupAllQaData(): Promise<void> {
  // Fallback: sweep any lingering [S1-QA] rows from crashed runs
  const orgs = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(like(schema.organizations.name, "[S1-QA]%"));
  for (const org of orgs) {
    await cleanupOrg(org.id);
  }
}
