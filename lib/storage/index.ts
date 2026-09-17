import type { StorageAdapter } from "./types";

export type { StorageAdapter };

export function getStorage(): StorageAdapter {
  const driver = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();

  if (driver === "supabase") {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars to be set",
      );
    }
    const { SupabaseStorageAdapter } = require("./supabase-adapter") as typeof import("./supabase-adapter");
    return new SupabaseStorageAdapter();
  }

  if (driver === "local") {
    const { LocalStorageAdapter } = require("./local-adapter") as typeof import("./local-adapter");
    return new LocalStorageAdapter();
  }

  throw new Error(`Unknown STORAGE_DRIVER "${driver}" (expected 'local' or 'supabase')`);
}
