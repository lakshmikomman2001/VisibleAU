/**
 * One-time backfill: populate data_residency_log for all existing orgs.
 * Idempotent (UPSERT) — safe to re-run.
 *
 * Usage:
 *   node scripts/backfill-residency.mjs postgresql://postgres:password@localhost:5432/visibleau
 *   node scripts/backfill-residency.mjs postgresql://postgres:password@localhost:5432/visibleau_prod
 */
import postgres from "postgres";

const RESIDENCY_MAP = [
  { dataType: "audit_data", storageRegion: "ap-southeast-2", provider: "supabase", retentionPeriod: "12 months", encryptionStatus: "AES-256 at rest, TLS 1.3 in transit" },
  { dataType: "evidence_snapshots", storageRegion: "ap-southeast-2", provider: "supabase", retentionPeriod: "12 months", encryptionStatus: "AES-256 at rest, TLS 1.3 in transit" },
  { dataType: "pdf_reports", storageRegion: "ap-southeast-2", provider: "supabase", retentionPeriod: "12 months", encryptionStatus: "AES-256 at rest, TLS 1.3 in transit" },
  { dataType: "llm_cache", storageRegion: "ap-southeast-2", provider: "supabase", retentionPeriod: "30 days", encryptionStatus: "AES-256 at rest, TLS 1.3 in transit" },
  { dataType: "crawler_logs", storageRegion: "ap-southeast-2", provider: "supabase", retentionPeriod: "90 days", encryptionStatus: "AES-256 at rest, TLS 1.3 in transit" },
  { dataType: "llm_processing_openai", storageRegion: "us", provider: "openai", retentionPeriod: "0 days", encryptionStatus: "TLS 1.3 in transit, no persistent storage" },
  { dataType: "llm_processing_anthropic", storageRegion: "us", provider: "anthropic", retentionPeriod: "0 days", encryptionStatus: "TLS 1.3 in transit, no persistent storage" },
];

const connStr = process.argv[2];
if (!connStr) {
  console.error("Usage: node scripts/backfill-residency.mjs <DATABASE_URL>");
  process.exit(1);
}

const sql = postgres(connStr);

const orgs = await sql`SELECT id FROM organizations`;
console.log(`Found ${orgs.length} orgs`);

let totalRows = 0;
for (const org of orgs) {
  for (const entry of RESIDENCY_MAP) {
    await sql`
      INSERT INTO data_residency_log (id, organization_id, data_type, storage_region, provider, retention_period, encryption_status, recorded_at)
      VALUES (gen_random_uuid(), ${org.id}, ${entry.dataType}, ${entry.storageRegion}, ${entry.provider}, ${entry.retentionPeriod}, ${entry.encryptionStatus}, NOW())
      ON CONFLICT (organization_id, data_type) DO UPDATE SET
        storage_region = EXCLUDED.storage_region,
        provider = EXCLUDED.provider,
        retention_period = EXCLUDED.retention_period,
        encryption_status = EXCLUDED.encryption_status,
        recorded_at = NOW()`;
    totalRows++;
  }
  console.log(`  ✓ org ${org.id}`);
}

console.log(`Done. Upserted ${totalRows} rows across ${orgs.length} orgs.`);
await sql.end();
