/**
 * tests/e2e/helpers/db.ts
 *
 * Direct DB access for the Playwright specs, in the local e2e database only: the URL is checked
 * before the client is made (./e2e-database.ts), so a spec that imports this can't write anywhere
 * else. Used for seeding rows a spec needs and for checking what the app wrote.
 *
 * Accounts and workspaces come from ./spec-account.ts. Playwright-run follow-ups (9 Nov), part 1:
 * `ensureOrganization` and `ensureUser` lived here and returned existing rows unchanged, so the specs
 * seeded into "E2E-S5 Org 1" while E2E_TEST_USER_1 signed in to the integration suite's workspace.
 */

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Brand } from "@/db/schema";
import * as schema from "@/db/schema";
import { e2eDatabaseUrl } from "./e2e-database";

const client = postgres(e2eDatabaseUrl(), { max: 1 });
export const db = drizzle(client, { schema });

/**
 * Delete every brand in a workspace. The app soft-deletes; this is a real DELETE, so each test in
 * a spec starts from an empty brand list.
 */
export async function deleteAllBrandsForOrg(orgId: string): Promise<void> {
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));
}

/**
 * Look up a brand by its UUID.
 * Returns null if not found (deleted or never existed).
 */
export async function getBrandById(id: string): Promise<Brand | null> {
  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, id));
  return brand ?? null;
}
