import { db } from "@/db/client";
import { directoryRegistry } from "@/db/schema";
import { applyDirectoryRegistryRows, type DirectoryRegistryRow } from "./registry";

/**
 * S00 part 5 (22 Nov; LLD 8.8.3): the directory_registry table into lib/directories/registry.ts, once per process
 * every five minutes, for server code. Every caller that counts or lists directories for a page, an API or a
 * report awaits loadDirectoryRegistry() first; the registry's own functions then read what it loaded. Without a
 * database configured (unit tests, which may not open one: tests/helpers/no-database-guard.ts) it reads nothing
 * and the registry stays its seed, the rows the migration wrote. A read that fails is logged and the last good list
 * (or the seed) stays in use; it's tried again on the next call after a minute.
 *
 * Kept apart from registry.ts because that module is also bundled for the browser (the landing FAQ, the Action
 * Center), which must never import the database client.
 */
const FRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;

let freshUntil = 0;
let inFlight: Promise<void> | null = null;

export async function loadDirectoryRegistry(opts: { force?: boolean } = {}): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  if (!opts.force && Date.now() < freshUntil) return;
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const rows = await db
          .select({
            domainPattern: directoryRegistry.domainPattern,
            directoryKey: directoryRegistry.directoryKey,
            name: directoryRegistry.name,
            kind: directoryRegistry.kind,
            market: directoryRegistry.market,
            appliesTo: directoryRegistry.appliesTo,
            profileUrlHint: directoryRegistry.profileUrlHint,
            active: directoryRegistry.active,
            sortOrder: directoryRegistry.sortOrder,
          })
          .from(directoryRegistry);
        if (rows.length === 0)
          console.warn(JSON.stringify({ event: "directory_registry_empty", usingSeed: true }));
        applyDirectoryRegistryRows(rows as DirectoryRegistryRow[]);
        freshUntil = Date.now() + FRESH_MS;
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "directory_registry_read_failed",
            error: err instanceof Error ? err.message : String(err),
          }),
        );
        freshUntil = Date.now() + RETRY_MS;
      } finally {
        inFlight = null;
      }
    })();
  }
  await inFlight;
}

/** Forget the last read, so the next call reads the table again (tests). */
export function forgetDirectoryRegistryRead(): void {
  freshUntil = 0;
}
