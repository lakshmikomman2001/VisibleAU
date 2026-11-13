import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(__dirname, "../../../../.env.test.local") });

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { audits } from "@/db/schema/audits";
import { brands } from "@/db/schema/brands";
import { organizations } from "@/db/schema/organizations";
import { queryFanOutResults } from "@/db/schema/query-fan-out-results";
import { subscriptions } from "@/db/schema/subscriptions";
import { verticalPackPrompts } from "@/db/schema/vertical-pack-prompts";
import { verticalPacks } from "@/db/schema/vertical-packs";
import { assertIntegrationDatabaseUrl } from "@/tests/helpers/integration-database";

// 13 Nov, part 6: truncateAll() below empties organizations, users and the vertical packs. It ran against
// Playwright's visibleau_e2e (removing user 1's membership and all 336 pack prompts); it runs only against the
// integration tests' own database now, and refuses anything else before connecting.
const client = postgres(assertIntegrationDatabaseUrl(process.env.DATABASE_URL), { max: 1 });
export const testDb = drizzle(client);

export async function seedOrganization(data: {
  clerkOrgId: string;
  name: string;
  tier?: (typeof organizations.$inferInsert)["tier"];
}) {
  const [org] = await testDb
    .insert(organizations)
    .values({
      clerkOrgId: data.clerkOrgId,
      name: data.name,
      region: "au",
      tier: data.tier ?? "free",
    })
    .returning();
  return org;
}

export async function seedBrand(data: { organizationId: string; name: string; domain: string }) {
  const [brand] = await testDb
    .insert(brands)
    .values({
      organizationId: data.organizationId,
      name: data.name,
      domain: data.domain,
      vertical: "tradies",
      region: "au",
      competitors: [],
      primaryRegions: [],
    })
    .returning();
  return brand;
}

export async function seedPrompt(packId: string, template: string) {
  const [prompt] = await testDb
    .insert(verticalPackPrompts)
    .values({
      packId,
      promptTemplate: template,
      rank: 1,
    })
    .returning();
  return prompt;
}

export async function seedVerticalPack() {
  const [pack] = await testDb
    .insert(verticalPacks)
    .values({
      vertical: "tradies",
      region: "au",
      version: "1.0",
      name: "Test Pack",
      promptsCount: 1,
    })
    .onConflictDoNothing()
    .returning();
  if (!pack) {
    const [existing] = await testDb.select().from(verticalPacks).limit(1);
    return existing;
  }
  return pack;
}

export async function truncateAll() {
  await testDb.execute(
    sql`TRUNCATE organizations, brands, audits, subscriptions, query_fan_out_results, citations, action_items, drift_alerts, users, vertical_pack_prompts, vertical_packs CASCADE`,
  );
}

export {
  audits,
  brands,
  organizations,
  queryFanOutResults,
  subscriptions,
  verticalPackPrompts,
  verticalPacks,
};
