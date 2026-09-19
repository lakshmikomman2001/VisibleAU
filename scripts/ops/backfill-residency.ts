/**
 * Backfills data_residency_log for every existing org to match RESIDENCY_CONFIG
 * (lib/governance/residency-config.ts) — the same source of truth the writer
 * (recordDataResidency) uses for new orgs going forward.
 *
 * Idempotent: upserts on the (organization_id, data_type) unique key, then
 * deletes only rows whose data_type is no longer in the config (the stale
 * granular claims this fix retires — e.g. any row still claiming a
 * provider/region that predates D3). Never touches other orgs' unrelated
 * tables, never blind-deletes.
 *
 * Usage:
 *   SERVICE_DATABASE_URL=postgresql://... pnpm tsx scripts/ops/backfill-residency.ts
 */
import postgres from "postgres";
import { RESIDENCY_CONFIG } from "../../lib/governance/residency-config";

async function main() {
  const dbUrl = process.env.SERVICE_DATABASE_URL;
  if (!dbUrl) {
    console.error("SERVICE_DATABASE_URL is required");
    process.exit(1);
  }

  const sql = postgres(dbUrl, { max: 1 });
  const label = process.env.BACKFILL_LABEL ?? "database";

  try {
    const orgs = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM organizations ORDER BY created_at
    `;

    console.log(`\n=== ${label}: ${orgs.length} org(s) ===`);

    let totalUpserted = 0;
    let totalDeleted = 0;

    for (const org of orgs) {
      let upserted = 0;
      for (const entry of RESIDENCY_CONFIG) {
        await sql`
          INSERT INTO data_residency_log
            (organization_id, data_type, storage_region, provider, retention_period, encryption_status)
          VALUES
            (${org.id}, ${entry.dataType}, ${entry.storageRegion}, ${entry.provider}, ${entry.retentionPeriod}, ${entry.encryptionStatus})
          ON CONFLICT (organization_id, data_type) DO UPDATE SET
            storage_region = EXCLUDED.storage_region,
            provider = EXCLUDED.provider,
            retention_period = EXCLUDED.retention_period,
            encryption_status = EXCLUDED.encryption_status,
            recorded_at = now()
        `;
        upserted++;
      }

      const validDataTypes = RESIDENCY_CONFIG.map((e) => e.dataType);
      const deletedRows = await sql<{ data_type: string }[]>`
        DELETE FROM data_residency_log
        WHERE organization_id = ${org.id}
          AND data_type != ALL(${sql.array(validDataTypes)})
        RETURNING data_type
      `;

      totalUpserted += upserted;
      totalDeleted += deletedRows.length;

      console.log(
        `  org ${org.id} (${org.name}): upserted ${upserted}, deleted ${deletedRows.length}` +
          (deletedRows.length > 0 ? ` [${deletedRows.map((r) => r.data_type).join(", ")}]` : ""),
      );
    }

    console.log(`  TOTAL: upserted ${totalUpserted}, deleted ${totalDeleted}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
