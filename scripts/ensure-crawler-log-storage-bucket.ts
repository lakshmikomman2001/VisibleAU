/**
 * Ensures the private Storage bucket for uploaded server logs exists in the Supabase project (20 Nov, part 5): a log
 * waits here only until inngest/functions/parse-crawler-log.ts has parsed it, then it's deleted. Plain text, CSV and
 * gzip only, up to 50 MB (the upload's own limit, lib/agent-analytics/log-upload-storage.ts) -- Supabase refuses
 * anything else itself. Private: only the service role (the app's server code) reads or writes it, so it needs no
 * policies. Idempotent: if the bucket exists, it prints its settings and changes nothing.
 * Uses the SERVICE ROLE key (bucket admin). Prints no URL or key.
 *
 *   npx dotenv -e <env file for the project> -- npx tsx scripts/ensure-crawler-log-storage-bucket.ts
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "crawler-logs";
const SETTINGS = {
  public: false,
  allowedMimeTypes: ["text/plain", "text/csv", "application/gzip"],
  fileSizeLimit: 50 * 1024 * 1024,
};

if (!url || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the target project.");
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) throw new Error(`listBuckets failed: ${listErr.message}`);

  const existing = buckets?.find((b) => b.name === BUCKET);
  if (existing) {
    console.log(
      `✓ Bucket "${BUCKET}" already exists: public=${existing.public}, allowed=${JSON.stringify(existing.allowed_mime_types ?? null)}, limit=${existing.file_size_limit ?? "none"}. Nothing changed.`,
    );
    return;
  }

  const { error: createErr } = await admin.storage.createBucket(BUCKET, SETTINGS);
  if (createErr) throw new Error(`createBucket("${BUCKET}") failed: ${createErr.message}`);

  console.log(`✓ Created private bucket "${BUCKET}" (plain text, CSV and gzip, up to 50 MB).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
