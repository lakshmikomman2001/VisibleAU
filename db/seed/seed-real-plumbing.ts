/**
 * Seeds Sydney Plumbing Solutions — a REAL ABR-verified brand for manual audit testing.
 * ABN 81 121 903 919 (active, GST registered, NSW 2212 Condell Park).
 *
 * Adds to Sri's existing "VisibleAU Dev" org so the brand is immediately visible in the app.
 * Also ensures a subscriptions row exists for that org (growth tier) so subscriptions.tier
 * is the source of truth for engine count.
 *
 * Run: npx tsx db/seed/seed-real-plumbing.ts
 *
 * Cleanup: DELETE FROM brands WHERE abn = '81121903919';
 *          DELETE FROM subscriptions WHERE organization_id = '31a7c684-35b1-4340-a24d-4f8898f252a5';
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { brands } from "../schema/brands";
import { subscriptions } from "../schema/subscriptions";

const PROD_URL = "postgresql://postgres:password@localhost:5432/visibleau_prod";
const client = postgres(PROD_URL, { max: 1 });
const db = drizzle(client);

const SRI_ORG_ID = "31a7c684-35b1-4340-a24d-4f8898f252a5";

async function main() {
  // Verify the org exists
  const [org] = await client`SELECT id, name, tier FROM organizations WHERE id = ${SRI_ORG_ID}`;
  if (!org) {
    console.error("[seed-plumbing] VisibleAU Dev org not found. Aborting.");
    process.exit(1);
  }
  console.log(`[seed-plumbing] Using org: ${org.name} (${org.id}), org.tier=${org.tier}`);

  // 1. Ensure a subscription row exists (subscriptions.tier = source of truth)
  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, SRI_ORG_ID));

  if (existingSub) {
    console.log(`[seed-plumbing] Subscription already exists: tier=${existingSub.tier}, status=${existingSub.status}`);
  } else {
    const [sub] = await db
      .insert(subscriptions)
      .values({
        organizationId: SRI_ORG_ID,
        stripeCustomerId: "cus_test_visibleau_dev",
        stripeSubscriptionId: "sub_test_visibleau_dev",
        stripePriceId: "price_test_growth_monthly",
        tier: "growth",
        billingInterval: "monthly",
        status: "active",
      })
      .returning();
    console.log(`[seed-plumbing] Created subscription: id=${sub.id}, tier=${sub.tier}`);
  }

  // 2. Insert brand (idempotent — check by ABN)
  const [existing] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.abn, "81121903919"));

  let brandId: string;

  if (existing) {
    brandId = existing.id;
    console.log(`[seed-plumbing] Brand already exists: ${brandId}`);
  } else {
    const [brand] = await db
      .insert(brands)
      .values({
        organizationId: SRI_ORG_ID,
        name: "Sydney Plumbing Solutions",
        domain: "sydneyplumbingsolutions.com.au",
        vertical: "tradies",
        region: "au",
        abn: "81121903919",
        primaryRegions: ["NSW:Condell Park"],
        competitors: [],
      })
      .returning();
    brandId = brand.id;
    console.log(`[seed-plumbing] Created brand: ${brandId}`);
  }

  // 3. Verify
  const [row] = await client`
    SELECT o.id AS org_id, o.name AS org, s.tier AS sub_tier, b.id AS brand_id,
           b.name AS brand, b.abn, b.primary_regions
    FROM organizations o
    LEFT JOIN subscriptions s ON s.organization_id = o.id
    JOIN brands b ON b.organization_id = o.id
    WHERE o.id = ${SRI_ORG_ID} AND b.abn = '81121903919'
  `;

  console.log("\n[seed-plumbing] === VERIFICATION ===");
  console.log(`  org:    ${row.org} (${row.org_id})`);
  console.log(`  tier:   ${row.sub_tier} (via subscriptions)`);
  console.log(`  brand:  ${row.brand} (${row.brand_id})`);
  console.log(`  ABN:    ${row.abn}`);
  console.log(`  regions: ${JSON.stringify(row.primary_regions)}`);
  console.log("\n[seed-plumbing] Done. Brand visible under sri@visibleau.local's org.");

  await client.end();
}

main().catch((err) => {
  console.error("[seed-plumbing] Fatal:", err);
  process.exit(1);
});
