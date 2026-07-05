/**
 * Ensures the private Storage bucket for report PDFs exists in the Supabase project.
 * Idempotent: safe to run repeatedly (skips if the bucket already exists).
 * Uses the SERVICE ROLE key (bucket admin).
 *
 *   npx dotenv -e .env.prod -- npx tsx scripts/ensure-report-storage-bucket.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "reports";

if (!url || !serviceKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (load .env.prod for the prod project).",
  );
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) throw new Error(`listBuckets failed: ${listErr.message}`);

  if (buckets?.some((b) => b.name === BUCKET)) {
    console.log(`✓ Bucket "${BUCKET}" already exists — nothing to do.`);
    return;
  }

  const { error: createErr } = await admin.storage.createBucket(BUCKET, {
    public: false,
    allowedMimeTypes: ["application/pdf"],
    fileSizeLimit: 26214400, // 25 MB
  });
  if (createErr)
    throw new Error(`createBucket("${BUCKET}") failed: ${createErr.message}`);

  console.log(`✓ Created private bucket "${BUCKET}".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
