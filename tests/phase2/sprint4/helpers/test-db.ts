import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../../../../.env.test.local") });

import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { organizations } from "@/db/schema/organizations";
import { brands } from "@/db/schema/brands";
import { subscriptions } from "@/db/schema/subscriptions";
import { audits } from "@/db/schema/audits";
import { queryFanOutResults } from "@/db/schema/query-fan-out-results";
import { verticalPacks } from "@/db/schema/vertical-packs";
import { verticalPackPrompts } from "@/db/schema/vertical-pack-prompts";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
export const testDb = drizzle(client);

export async function seedOrganization(data: {
  clerkOrgId: string;
  name: string;
  tier?: string;
}) {
  const [org] = await testDb
    .insert(organizations)
    .values({
      clerkOrgId: data.clerkOrgId,
      name: data.name,
      region: "au",
      tier: (data.tier ?? "free") as any,
    })
    .returning();
  return org;
}

export async function seedBrand(data: {
  organizationId: string;
  name: string;
  domain: string;
}) {
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
    const [existing] = await testDb
      .select()
      .from(verticalPacks)
      .limit(1);
    return existing;
  }
  return pack;
}

export async function truncateAll() {
  await testDb.execute(
    sql`TRUNCATE organizations, brands, audits, subscriptions, query_fan_out_results, citations, action_items, drift_alerts, users, vertical_pack_prompts, vertical_packs CASCADE`,
  );
}

export { organizations, brands, subscriptions, audits, queryFanOutResults, verticalPacks, verticalPackPrompts };
