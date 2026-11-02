/**
 * 3 Nov ("Logo uploads: limits now, cleanup job dry-run") -- the weekly job that
 * removes logos nothing references. Against the local test database, the real
 * LocalStorageAdapter (a temp folder) and the real Inngest function:
 * - a file is an orphan only when it's over 7 days old and no brands.logo_url or
 *   agency_brand_assets.logo_url names it, soft-deleted brands included;
 * - if the database can't be read, nothing is deleted;
 * - dry-run is the default: it logs what it would delete and deletes nothing;
 * - delete mode removes only orphans, oldest first, up to the cap per run.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/db/client";
import { serviceDb } from "@/db/client";
import {
  LOGO_CLEANUP_MAX_PER_RUN,
  LOGO_ORPHAN_MIN_AGE_DAYS,
  logoCleanupMode,
  sweepOrphanLogos,
} from "@/lib/branding/cleanup-orphan-logos";
import { storedLogoPath, storedLogoUrl } from "@/lib/branding/logo";
import { LocalStorageAdapter } from "@/lib/storage/local-adapter";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/storage", async () => {
  const { LocalStorageAdapter: Adapter } = await import("@/lib/storage/local-adapter");
  return { getStorage: () => new Adapter() };
});

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date();
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);
const OLD = daysAgo(LOGO_ORPHAN_MIN_AGE_DAYS + 1);

const ORG = randomUUID();
const OTHER_ORG = randomUUID();
const BRAND = randomUUID();
const DELETED_BRAND = randomUUID();

let sql: ReturnType<typeof postgres>;
let storageDir: string;
let storage: LocalStorageAdapter;

function put(org: string, age: Date, file = `${randomUUID()}.png`): string {
  const folder = join(storageDir, org, "branding");
  mkdirSync(folder, { recursive: true });
  const full = join(folder, file);
  writeFileSync(full, "x");
  utimesSync(full, age, age);
  return file;
}

const stored = (org: string, file: string) => existsSync(join(storageDir, org, "branding", file));
const allFiles = (org: string) => {
  try {
    return readdirSync(join(storageDir, org, "branding"));
  } catch {
    return [];
  }
};

async function setBrandLogos(url: string | null, deletedUrl: string | null) {
  await sql`UPDATE brands SET logo_url = ${url} WHERE id = ${BRAND}`;
  await sql`UPDATE brands SET logo_url = ${deletedUrl} WHERE id = ${DELETED_BRAND}`;
}

const sweep = (mode: "dry-run" | "delete", over: { db?: DbClient; maxPerRun?: number } = {}) =>
  sweepOrphanLogos({ db: serviceDb, storage, mode, now: NOW, ...over });

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  storageDir = mkdtempSync(join(tmpdir(), "vunnara-logo-cleanup-"));
  for (const org of [ORG, OTHER_ORG]) {
    const tag = org.slice(0, 8);
    await sql`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${org}, ${`logo-cleanup-${tag}`}, ${`Logo Cleanup ${tag}`}, ${`logo-cleanup-${tag}`})
    `;
  }
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, deleted_at) VALUES
      (${BRAND}, ${ORG}, 'Kept Brand', ${`kept-${ORG.slice(0, 8)}.example.com.au`}, 'tradies', 'au', NULL),
      (${DELETED_BRAND}, ${ORG}, 'Deleted Brand', ${`gone-${ORG.slice(0, 8)}.example.com.au`}, 'tradies', 'au', now())
  `;
}, 60_000);

afterAll(async () => {
  for (const org of [ORG, OTHER_ORG]) {
    await sql`DELETE FROM agency_brand_assets WHERE organization_id = ${org}`;
    await sql`DELETE FROM brands WHERE organization_id = ${org}`;
    await sql`DELETE FROM organizations WHERE id = ${org}`;
  }
  await sql?.end();
  rmSync(storageDir, { recursive: true, force: true });
});

beforeEach(async () => {
  rmSync(storageDir, { recursive: true, force: true });
  mkdirSync(storageDir, { recursive: true });
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("STORAGE_LOCAL_DIR", storageDir);
  storage = new LocalStorageAdapter(storageDir);
  await setBrandLogos(null, null);
  await sql`DELETE FROM agency_brand_assets WHERE organization_id IN (${ORG}, ${OTHER_ORG})`;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("what's an orphan", () => {
  it("a referenced logo is never deleted, however old: a brand's, a soft-deleted brand's, the agency's, a per-brand override's", async () => {
    const brandFile = put(ORG, OLD);
    const deletedBrandFile = put(ORG, OLD);
    const workspaceFile = put(ORG, OLD);
    const overrideFile = put(ORG, OLD);
    const orphan = put(ORG, OLD);
    await setBrandLogos(storedLogoUrl(ORG, brandFile), storedLogoUrl(ORG, deletedBrandFile));
    await sql`
      INSERT INTO agency_brand_assets (organization_id, brand_id, logo_url) VALUES
        (${ORG}, NULL, ${storedLogoUrl(ORG, workspaceFile)}),
        (${ORG}, ${BRAND}, ${storedLogoUrl(ORG, overrideFile)})
    `;

    const summary = await sweep("delete");

    for (const file of [brandFile, deletedBrandFile, workspaceFile, overrideFile]) {
      expect(stored(ORG, file)).toBe(true);
    }
    expect(stored(ORG, orphan)).toBe(false);
    expect(summary).toMatchObject({ mode: "delete", referenced: 4, orphans: 1, deleted: 1 });
  });

  it("a logo another workspace's row names is kept too", async () => {
    const file = put(OTHER_ORG, OLD);
    await setBrandLogos(storedLogoUrl(OTHER_ORG, file), null);
    await sweep("delete");
    expect(stored(OTHER_ORG, file)).toBe(true);
  });

  it("a row naming the file some other way (a whole URL, a query) still keeps it", async () => {
    const file = put(ORG, OLD);
    await setBrandLogos(`https://vunnara.com.au${storedLogoUrl(ORG, file)}?v=2`, null);
    await sweep("delete");
    expect(stored(ORG, file)).toBe(true);
  });

  it("one under 7 days old is never deleted, even with nothing naming it", async () => {
    const fresh = put(ORG, daysAgo(LOGO_ORPHAN_MIN_AGE_DAYS - 1));
    const summary = await sweep("delete");
    expect(stored(ORG, fresh)).toBe(true);
    expect(summary).toMatchObject({ tooNew: 1, orphans: 0, deleted: 0 });
  });

  it("just over the cut-off it goes, just under it stays", async () => {
    const over = put(ORG, new Date(daysAgo(LOGO_ORPHAN_MIN_AGE_DAYS).getTime() - 60_000));
    const under = put(ORG, new Date(daysAgo(LOGO_ORPHAN_MIN_AGE_DAYS).getTime() + 60_000));
    await sweep("delete");
    expect(stored(ORG, over)).toBe(false);
    expect(stored(ORG, under)).toBe(true);
  });

  it("a file whose age isn't known is never deleted", async () => {
    const file = put(ORG, OLD);
    const dateless = new LocalStorageAdapter(storageDir);
    const realList = dateless.list.bind(dateless);
    dateless.list = async (folder: string) => {
      const listing = await realList(folder);
      return { ...listing, files: listing.files.map((f) => ({ ...f, createdAt: null })) };
    };
    await sweepOrphanLogos({ db: serviceDb, storage: dateless, mode: "delete", now: NOW });
    expect(stored(ORG, file)).toBe(true);
  });

  it("a file that isn't one of ours by name is left alone", async () => {
    const placeholder = put(ORG, OLD, ".emptyFolderPlaceholder");
    const other = put(ORG, OLD, "notes.txt");
    const summary = await sweep("delete");
    expect(stored(ORG, placeholder)).toBe(true);
    expect(stored(ORG, other)).toBe(true);
    expect(summary.deleted).toBe(0);
  });

  it("only <org>/branding/ is looked at: other folders in the store aren't touched", async () => {
    const reportFolder = join(storageDir, ORG, "reports");
    mkdirSync(reportFolder, { recursive: true });
    const report = join(reportFolder, `${randomUUID()}.png`);
    writeFileSync(report, "x");
    utimesSync(report, OLD, OLD);
    const topLevel = join(storageDir, "not-a-workspace", "branding");
    mkdirSync(topLevel, { recursive: true });
    const stray = join(topLevel, `${randomUUID()}.png`);
    writeFileSync(stray, "x");
    utimesSync(stray, OLD, OLD);
    await sweep("delete");
    expect(existsSync(report)).toBe(true);
    expect(existsSync(stray)).toBe(true);
  });
});

describe("if the database can't be read, nothing is deleted", () => {
  const failingDb = () =>
    ({
      select: () => {
        throw new Error("database is down");
      },
    }) as unknown as DbClient;

  it("the first read failing stops it before anything is listed or deleted", async () => {
    const orphan = put(ORG, OLD);
    const list = vi.spyOn(storage, "list");
    const remove = vi.spyOn(storage, "delete");
    await expect(sweep("delete", { db: failingDb() })).rejects.toThrow("database is down");
    expect(list).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(stored(ORG, orphan)).toBe(true);
  });

  it("the second read, just before deleting, failing stops it too", async () => {
    const orphan = put(ORG, OLD);
    let reads = 0;
    const flakyDb = {
      select: (...args: Parameters<typeof serviceDb.select>) => {
        // Two selects per read of the references: brands, then agency rows.
        reads += 1;
        if (reads > 2) throw new Error("database went down");
        return serviceDb.select(...args);
      },
    } as unknown as DbClient;
    const remove = vi.spyOn(storage, "delete");
    await expect(sweep("delete", { db: flakyDb })).rejects.toThrow("database went down");
    expect(remove).not.toHaveBeenCalled();
    expect(stored(ORG, orphan)).toBe(true);
  });

  it("a logo saved between the first read and the deletion is kept", async () => {
    const savedMeanwhile = put(ORG, OLD);
    const orphan = put(ORG, OLD);
    const realList = storage.list.bind(storage);
    let saved = false;
    storage.list = async (folder: string) => {
      const listing = await realList(folder);
      if (!saved) {
        saved = true;
        await setBrandLogos(storedLogoUrl(ORG, savedMeanwhile), null);
      }
      return listing;
    };
    await sweep("delete");
    expect(stored(ORG, savedMeanwhile)).toBe(true);
    expect(stored(ORG, orphan)).toBe(false);
  });

  it("storage failing to list deletes nothing either", async () => {
    const orphan = put(ORG, OLD);
    const remove = vi.spyOn(storage, "delete");
    storage.list = async () => {
      throw new Error("storage can't be reached");
    };
    await expect(sweep("delete")).rejects.toThrow("storage can't be reached");
    expect(remove).not.toHaveBeenCalled();
    expect(stored(ORG, orphan)).toBe(true);
  });
});

describe("the mode", () => {
  it.each([
    [undefined, "dry-run"],
    ["", "dry-run"],
    ["dry-run", "dry-run"],
    ["DELETE ALL", "dry-run"],
    ["true", "dry-run"],
    ["delete", "delete"],
    [" Delete ", "delete"],
  ])("LOGO_CLEANUP_MODE=%s is %s: only 'delete' deletes", (value, mode) => {
    expect(logoCleanupMode(value)).toBe(mode);
  });

  it("dry-run deletes nothing, and logs what it would delete: counts and paths", async () => {
    const orphan = put(ORG, OLD);
    const kept = put(ORG, OLD);
    await setBrandLogos(storedLogoUrl(ORG, kept), null);
    const remove = vi.spyOn(storage, "delete");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const summary = await sweep("dry-run");

    expect(remove).not.toHaveBeenCalled();
    expect(stored(ORG, orphan)).toBe(true);
    expect(summary).toMatchObject({
      mode: "dry-run",
      stored: 2,
      referenced: 1,
      orphans: 1,
      wouldDelete: 1,
      deleted: 0,
    });
    const lines = log.mock.calls.map((call) => JSON.parse(String(call[0])));
    expect(lines[0]).toMatchObject({ event: "logo_cleanup", mode: "dry-run", wouldDelete: 1 });
    expect(lines.flatMap((line) => line.paths ?? [])).toEqual([storedLogoPath(ORG, orphan)]);
  });
});

describe("delete mode", () => {
  it("removes only the orphans, oldest first, up to the cap; the rest wait for the next run", async () => {
    const newest = put(ORG, daysAgo(10));
    const oldest = put(ORG, daysAgo(40));
    const middle = put(ORG, daysAgo(20));
    const kept = put(ORG, daysAgo(50));
    const fresh = put(ORG, daysAgo(1));
    await setBrandLogos(storedLogoUrl(ORG, kept), null);

    const first = await sweep("delete", { maxPerRun: 2 });
    expect(first).toMatchObject({ orphans: 3, deleted: 2, capped: true });
    expect(stored(ORG, oldest)).toBe(false);
    expect(stored(ORG, middle)).toBe(false);
    expect(stored(ORG, newest)).toBe(true);
    expect(stored(ORG, kept)).toBe(true);
    expect(stored(ORG, fresh)).toBe(true);

    const second = await sweep("delete", { maxPerRun: 2 });
    expect(second).toMatchObject({ orphans: 1, deleted: 1, capped: false });
    expect(stored(ORG, newest)).toBe(false);
    expect(allFiles(ORG).sort()).toEqual([fresh, kept].sort());
  });

  it("the cap defaults to 500", async () => {
    expect(LOGO_CLEANUP_MAX_PER_RUN).toBe(500);
    for (let i = 0; i < 3; i++) put(ORG, OLD);
    expect((await sweep("delete")).deleted).toBe(3);
  });

  it("running it again with nothing left to do changes nothing", async () => {
    const kept = put(ORG, OLD);
    await setBrandLogos(storedLogoUrl(ORG, kept), null);
    put(ORG, OLD);
    await sweep("delete");
    expect(await sweep("delete")).toMatchObject({ orphans: 0, deleted: 0 });
    expect(allFiles(ORG)).toEqual([kept]);
  });
});

describe("the Inngest function", () => {
  type Handler = (ctx: { step: unknown }) => Promise<Record<string, unknown>>;
  const steps: string[] = [];
  const step = {
    run: async (id: string, work: () => Promise<unknown>) => {
      steps.push(id);
      return work();
    },
  };

  async function runFunction() {
    const { cleanupOrphanLogos } = await import("@/inngest/functions/cleanup-orphan-logos");
    return (cleanupOrphanLogos as unknown as { fn: Handler }).fn({ step });
  }

  beforeEach(() => {
    steps.length = 0;
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("with no setting it's a dry run, whatever is in the folder", async () => {
    const orphan = put(ORG, OLD);
    vi.stubEnv("LOGO_CLEANUP_MODE", "");
    const result = await runFunction();
    expect(result).toMatchObject({ mode: "dry-run", deleted: 0 });
    expect(stored(ORG, orphan)).toBe(true);
    expect(steps).toEqual(["logo-cleanup:sweep"]);
  });

  it("LOGO_CLEANUP_MODE=delete deletes", async () => {
    const orphan = put(ORG, OLD);
    vi.stubEnv("LOGO_CLEANUP_MODE", "delete");
    const result = await runFunction();
    expect(result).toMatchObject({ mode: "delete", deleted: 1 });
    expect(stored(ORG, orphan)).toBe(false);
  });

  it("it's served, and runs weekly", async () => {
    const { cleanupOrphanLogos } = await import("@/inngest/functions/cleanup-orphan-logos");
    const fn = cleanupOrphanLogos as unknown as {
      id: () => string;
      opts: { triggers: Array<{ cron?: string }> };
    };
    expect(fn.id()).toContain("cleanup-orphan-logos");
    const cron = fn.opts.triggers[0].cron ?? "";
    expect(cron).toMatch(/^\S+ \S+ \* \* [0-6]$/);
  });
});
