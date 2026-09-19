/**
 * D3 Step 4 — proves Supabase Storage (the new project, jnadjycrdikunbecpvuk)
 * actually works before the data_residency_log claims `pdf_reports` lives
 * there. Uses the app's own SupabaseStorageAdapter (lib/storage) for
 * upload/download, not a raw Supabase SDK call, so this proves the exact
 * code path production uses.
 *
 * Usage:
 *   STORAGE_DRIVER=supabase SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm tsx scripts/ops/storage-smoke.ts
 */
import { getSupabaseAdmin } from "../../lib/supabase";
import { SupabaseStorageAdapter } from "../../lib/storage/supabase-adapter";

const BUCKET = "reports";

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    process.exit(1);
  }

  const path = `smoke/${Date.now()}.txt`;
  const payload = Buffer.from(`residency-smoke-test ${new Date().toISOString()}`, "utf-8");
  const adapter = new SupabaseStorageAdapter();

  try {
    await adapter.upload(path, payload, "text/plain");
    console.log(`upload OK (${path}, ${payload.length} bytes)`);

    const signedUrl = await adapter.getDownloadUrl(path, 60);
    const res = await fetch(signedUrl);
    if (!res.ok) {
      throw new Error(`download failed: HTTP ${res.status}`);
    }
    const downloaded = Buffer.from(await res.arrayBuffer());
    console.log("download OK");

    const bytesMatch = downloaded.equals(payload);
    console.log(bytesMatch ? "bytes match" : "bytes DO NOT match");
    if (!bytesMatch) {
      console.error(`  expected ${payload.length} bytes, got ${downloaded.length} bytes`);
      process.exit(1);
    }

    const supabase = getSupabaseAdmin();
    const { error: deleteError } = await supabase.storage.from(BUCKET).remove([path]);
    if (deleteError) {
      throw new Error(`delete failed: ${deleteError.message}`);
    }
    console.log("deleted");

    console.log(`\nobject path used: ${BUCKET}/${path}`);
  } catch (err) {
    console.error("SMOKE TEST FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
