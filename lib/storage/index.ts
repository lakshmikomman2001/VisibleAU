import type { StorageAdapter } from "./types";

export type { StorageAdapter };

/**
 * "reports" (the default) holds report PDFs and accepts only PDFs; "logos"
 * holds uploaded logos and accepts only PNG and JPEG, up to 2 MB
 * (scripts/ensure-logo-storage-bucket.ts); "crawler-logs" holds an uploaded
 * server log until it's parsed, up to 50 MB (scripts/ensure-crawler-log-storage-bucket.ts,
 * 20 Nov). All private. The local driver has one folder for all three; a logo's
 * path has its own branding/ folder, a log's its crawler-logs/ folder.
 */
export type StorageBucket = "reports" | "logos" | "crawler-logs";

export function getStorage(bucket: StorageBucket = "reports"): StorageAdapter {
  const driver = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();

  if (driver === "supabase") {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars to be set",
      );
    }
    const { SupabaseStorageAdapter } =
      require("./supabase-adapter") as typeof import("./supabase-adapter");
    return new SupabaseStorageAdapter(bucket);
  }

  if (driver === "local") {
    const { LocalStorageAdapter } = require("./local-adapter") as typeof import("./local-adapter");
    return new LocalStorageAdapter();
  }

  throw new Error(`Unknown STORAGE_DRIVER "${driver}" (expected 'local' or 'supabase')`);
}
