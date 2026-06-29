/**
 * Seeds Lighting Up Melbourne Electrical — a REAL ABR-verified brand for manual audit testing.
 * ABN 31 631 627 828 (active, GST registered, VIC 3016 Williamstown).
 *
 * Reuses Sri's existing "VisibleAU Dev" org (same as plumbing brand) so the brand is
 * immediately visible in the app. Subscription already exists from the plumbing seed.
 *
 * Run: npx tsx db/seed/seed-real-electrical.ts
 *
 * Cleanup: DELETE FROM brands WHERE abn = '31631627828';
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { brands } from "../schema/brands";

const PROD_URL = "postgresql://postgres:password@localhost:5432/visibleau_prod";
const client = postgres(PROD_URL, { max: 1 });
const db = drizzle(client);

const SRI_ORG_ID = "31a7c684-35b1-4340-a24d-4f8898f252a5";

async function main() {
  const [org] = await client`SELECT id, name FROM organizations WHERE id = ${SRI_ORG_ID}`;
  if (!org) {
    console.error("[seed-electrical] VisibleAU Dev org not found. Aborting.");
    process.exit(1);
  }
  console.log(`[seed-electrical] Using org: ${org.name} (${org.id})`);

  const [existing] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.abn, "31631627828"));

  let brandId: string;

  if (existing) {
    brandId = existing.id;
    console.log(`[seed-electrical] Brand already exists: ${brandId}`);
  } else {
    const [brand] = await db
      .insert(brands)
      .values({
        organizationId: SRI_ORG_ID,
        name: "Lighting Up Melbourne Electrical",
        domain: "lightingupmelbourneelectrical.com.au",
        vertical: "tradies",
        region: "au",
        abn: "31631627828",
        primaryRegions: ["VIC:Williamstown"],
        competitors: [],
      })
      .returning();
    brandId = brand.id;
    console.log(`[seed-electrical] Created brand: ${brandId}`);
  }

  const [row] = await client`
    SELECT o.id AS org_id, o.name AS org, s.tier AS sub_tier, b.id AS brand_id,
           b.name AS brand, b.abn, b.primary_regions, b.vertical
    FROM organizations o
    LEFT JOIN subscriptions s ON s.organization_id = o.id
    JOIN brands b ON b.organization_id = o.id
    WHERE o.id = ${SRI_ORG_ID} AND b.abn = '31631627828'
  `;

  console.log("\n[seed-electrical] === VERIFICATION ===");
  console.log(`  org:      ${row.org} (${row.org_id})`);
  console.log(`  tier:     ${row.sub_tier} (via subscriptions)`);
  console.log(`  brand:    ${row.brand} (${row.brand_id})`);
  console.log(`  ABN:      ${row.abn}`);
  console.log(`  vertical: ${row.vertical}`);
  console.log(`  regions:  ${JSON.stringify(row.primary_regions)}`);
  console.log("\n[seed-electrical] Done. Brand visible under sri@visibleau.local's org.");

  await client.end();
}

main().catch((err) => {
  console.error("[seed-electrical] Fatal:", err);
  process.exit(1);
});
