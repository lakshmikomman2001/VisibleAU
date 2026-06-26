#!/usr/bin/env tsx
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);

async function run() {
  console.log("🔄 Backup restore verification\n");

  // 1. Table existence + row counts
  const tables = [
    "organizations",
    "brands",
    "audits",
    "citations",
    "users",
  ];
  for (const t of tables) {
    try {
      const [{ count }] = await client.unsafe(`SELECT COUNT(*) FROM ${t}`);
      console.log(`✅ ${t}: ${count} rows`);
    } catch (err) {
      console.error(`❌ ${t}: table not found or error`, err);
      process.exit(1);
    }
  }

  // 2. Foreign key integrity: no orphaned audit rows
  const orphans = await client`
    SELECT COUNT(*) as count FROM audits a
    WHERE NOT EXISTS (SELECT 1 FROM brands b WHERE b.id = a.brand_id)
  `;
  if (Number(orphans[0].count) > 0) {
    console.error("❌ Orphaned audit rows found");
    process.exit(1);
  }
  console.log("✅ Foreign key integrity OK");

  // 3. Check most recent audit timestamp
  const latest = await client`SELECT MAX(created_at) as max_ts FROM audits`;
  console.log("✅ Most recent audit in backup:", latest[0].max_ts);

  await client.end();
  console.log("\n✅ Backup restore verification complete");
}

run().catch((err) => {
  console.error("❌ Backup verification failed:", err);
  process.exit(1);
});
