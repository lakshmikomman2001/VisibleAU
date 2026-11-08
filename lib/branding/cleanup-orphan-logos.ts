import { isNotNull } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { agencyBrandAssets, brands } from "@/db/schema";
import { LOGO_ORPHAN_MIN_AGE_DAYS } from "@/lib/governance/residency-config";
import type { StorageAdapter } from "@/lib/storage/types";
import { LOGO_FILE, LOGO_ORG_ID, logoFilesNamedIn, storedLogoFolder } from "./logo";

/**
 * 3 Nov ("Logo uploads: limits now, cleanup job dry-run") -- finds and removes
 * uploaded logos nothing references: a wizard abandoned, a form left unsaved, a
 * logo replaced. Run weekly by inngest/functions/cleanup-orphan-logos.ts.
 *
 * Deleting is the one thing here that can't be undone, so every doubt keeps the
 * file: a database read that fails stops the run, a file with no known age or a
 * name that isn't ours stays, and any row naming the file, in any form and in any
 * workspace, soft-deleted brands included, keeps it. Saving a logo checks the URL's
 * shape, not that the file exists, so a draft left open over a few days must still
 * find its file: hence a week (LOGO_ORPHAN_MIN_AGE_DAYS, with every other retention period in
 * lib/governance/residency-config.ts), not a day.
 */
export { LOGO_ORPHAN_MIN_AGE_DAYS };
export const LOGO_CLEANUP_MAX_PER_RUN = 500;

const DAY_MS = 24 * 60 * 60 * 1000;
const PATHS_PER_LOG_LINE = 20;

export type LogoCleanupMode = "dry-run" | "delete";

export interface LogoCleanupSummary {
  mode: LogoCleanupMode;
  stored: number;
  referenced: number;
  tooNew: number;
  orphans: number;
  wouldDelete: number;
  deleted: number;
  capped: boolean;
}

/** LOGO_CLEANUP_MODE: only "delete" deletes. Unset, or anything else, is a dry run. */
export function logoCleanupMode(value = process.env.LOGO_CLEANUP_MODE): LogoCleanupMode {
  return value?.trim().toLowerCase() === "delete" ? "delete" : "dry-run";
}

/** Every logo file a saved row names. No deleted_at filter: a soft-deleted brand can come back. */
async function referencedLogoFiles(db: DbClient): Promise<Set<string>> {
  const brandRows = await db
    .select({ logoUrl: brands.logoUrl })
    .from(brands)
    .where(isNotNull(brands.logoUrl));
  const assetRows = await db
    .select({ logoUrl: agencyBrandAssets.logoUrl })
    .from(agencyBrandAssets)
    .where(isNotNull(agencyBrandAssets.logoUrl));
  return new Set([...brandRows, ...assetRows].flatMap((row) => logoFilesNamedIn(row.logoUrl)));
}

const fileNameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export async function sweepOrphanLogos(options: {
  db: DbClient;
  storage: StorageAdapter;
  mode: LogoCleanupMode;
  now?: Date;
  maxPerRun?: number;
}): Promise<LogoCleanupSummary> {
  const { db, storage, mode, now = new Date(), maxPerRun = LOGO_CLEANUP_MAX_PER_RUN } = options;
  const cutoff = now.getTime() - LOGO_ORPHAN_MIN_AGE_DAYS * DAY_MS;

  // First, before anything is listed: a failed read throws here, and nothing happens.
  const referencedAtStart = await referencedLogoFiles(db);

  const { folders } = await storage.list("");
  let stored = 0;
  let referenced = 0;
  let tooNew = 0;
  const orphans: Array<{ path: string; createdAt: number }> = [];
  for (const folder of folders) {
    if (!LOGO_ORG_ID.test(folder)) continue;
    const { files } = await storage.list(storedLogoFolder(folder));
    for (const file of files) {
      const name = fileNameOf(file.path);
      if (!LOGO_FILE.test(name)) continue;
      stored += 1;
      if (referencedAtStart.has(name)) {
        referenced += 1;
      } else if (!file.createdAt || file.createdAt.getTime() > cutoff) {
        tooNew += 1;
      } else {
        orphans.push({ path: file.path, createdAt: file.createdAt.getTime() });
      }
    }
  }

  orphans.sort((a, b) => a.createdAt - b.createdAt);
  const chosen = orphans.slice(0, maxPerRun);

  // Again just before deleting: a logo saved since the first read keeps its file.
  const referencedNow = await referencedLogoFiles(db);
  const paths = chosen.map((o) => o.path).filter((path) => !referencedNow.has(fileNameOf(path)));

  if (mode === "delete" && paths.length > 0) await storage.delete(paths);

  const summary: LogoCleanupSummary = {
    mode,
    stored,
    referenced,
    tooNew,
    orphans: orphans.length,
    wouldDelete: mode === "dry-run" ? paths.length : 0,
    deleted: mode === "delete" ? paths.length : 0,
    capped: orphans.length > maxPerRun,
  };
  console.log(JSON.stringify({ event: "logo_cleanup", ...summary }));
  for (let i = 0; i < paths.length; i += PATHS_PER_LOG_LINE) {
    console.log(
      JSON.stringify({
        event: "logo_cleanup_paths",
        mode,
        paths: paths.slice(i, i + PATHS_PER_LOG_LINE),
      }),
    );
  }
  return summary;
}
