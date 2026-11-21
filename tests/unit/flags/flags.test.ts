/**
 * S00 part 2 (22 Nov; LLD section 17): the feature flags. Every flag is off by default; a workspace's override wins
 * over the global value, either way; an expired override is none; a flag the store can't read is off. The flag
 * list is the one the LLD (section 17) and the UI contract (docs/prototypes/vunnara-ui-config.ts FlagName) name,
 * and migration 0153 lets the store hold each of them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  globals: [] as Array<{ key: string; value: unknown }>,
  overrides: [] as Array<{ flagKey: string; isEnabled: boolean; expiresAt: Date | null }>,
  fail: false,
  rlsOrgIds: [] as string[],
}));

/** A stand-in for the database: select().from().where() answers the rows above, or throws. */
vi.mock("@/db/client", () => {
  const chain = (rows: () => unknown[]) => ({
    select: () => ({
      from: () => ({
        where: async () => {
          if (store.fail) throw new Error("connection refused");
          return rows();
        },
      }),
    }),
  });
  return {
    db: chain(() => store.globals),
    // The settings store's module (lib/governance/google-surfaces.ts) imports it; nothing here reaches it.
    serviceDb: {},
    withRlsContext: async (orgId: string, fn: (tx: unknown) => Promise<unknown>) => {
      store.rlsOrgIds.push(orgId);
      return fn(chain(() => store.overrides));
    },
  };
});

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const ORG = "11111111-1111-4111-8111-111111111111";

// The first import loads the settings store's module and what it imports: seconds under load, once.
beforeAll(async () => {
  await import("@/lib/flags/flags");
}, 60_000);

beforeEach(() => {
  store.globals = [];
  store.overrides = [];
  store.fail = false;
  store.rlsOrgIds = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the flag list", () => {
  it("is the UI contract's FlagName union, the same names", async () => {
    const { FLAG_NAMES } = await import("@/lib/flags/flags");
    const union =
      read("docs/prototypes/vunnara-ui-config.ts").match(/export type FlagName =([^;]+);/)?.[1] ??
      "";
    const names = [...union.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    expect(names.length).toBe(13);
    expect([...FLAG_NAMES].sort()).toEqual([...names].sort());
  });

  it("is LLD section 17's table, in its order", async () => {
    const { FLAG_NAMES } = await import("@/lib/flags/flags");
    const section = read("docs/lld/vunnara-client-enhancements-lld-v1.md").match(
      /## 17\. Feature flags([\s\S]*?)\n## 18\./,
    )?.[1];
    expect(section).toBeDefined();
    const rows = (section as string).split("\n").filter((l) => l.startsWith("| `"));
    const names = rows.flatMap((row) =>
      [...(row.split("|")[1] ?? "").matchAll(/`([a-z0-9_]+)`/g)].map((m) => m[1]),
    );
    expect([...FLAG_NAMES]).toEqual(names);
  });

  it("every flag is described once, in FLAG_NAMES order", async () => {
    const { FLAG_NAMES, FLAGS } = await import("@/lib/flags/flags");
    expect(FLAGS.map((f) => f.name)).toEqual([...FLAG_NAMES]);
    for (const f of FLAGS) expect(f.gates.length).toBeGreaterThan(10);
  });

  it("migration 0153 lets feature_settings hold every flag, and keeps the six Google keys", async () => {
    const { FLAG_NAMES } = await import("@/lib/flags/flags");
    const check =
      read("db/migrations/0153_feature_flag_keys.sql").match(
        /CHECK \("key" IN \(([\s\S]*?)\)\)/,
      )?.[1] ?? "";
    const keys = [...check.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    for (const flag of FLAG_NAMES) expect(keys).toContain(flag);
    const google =
      read("db/migrations/0145_google_ai_surfaces.sql").match(
        /"key"\s+TEXT PRIMARY KEY CHECK \("key" IN \(([\s\S]*?)\)\)/,
      )?.[1] ?? "";
    const googleKeys = [...google.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    expect(googleKeys.length).toBe(6);
    for (const key of googleKeys) expect(keys).toContain(key);
    expect(keys.length).toBe(googleKeys.length + FLAG_NAMES.length);
  });
});

describe("decideFlag: the override, else the global value, else off", () => {
  it("is off with nothing set", async () => {
    const { decideFlag } = await import("@/lib/flags/flags");
    expect(decideFlag(undefined, undefined)).toBe(false);
  });

  it("follows the global value without an override", async () => {
    const { decideFlag } = await import("@/lib/flags/flags");
    expect(decideFlag(true, undefined)).toBe(true);
    expect(decideFlag(false, undefined)).toBe(false);
  });

  it("the workspace's override wins, either way", async () => {
    const { decideFlag } = await import("@/lib/flags/flags");
    expect(decideFlag(false, true)).toBe(true);
    expect(decideFlag(undefined, true)).toBe(true);
    expect(decideFlag(true, false)).toBe(false);
  });
});

describe("isEnabled", () => {
  it("every flag is off by default, for a workspace and for none", async () => {
    const { FLAG_NAMES, isEnabled } = await import("@/lib/flags/flags");
    for (const flag of FLAG_NAMES) {
      expect(await isEnabled(flag, ORG)).toBe(false);
      expect(await isEnabled(flag, null)).toBe(false);
    }
  });

  it("the global value turns a flag on; a workspace's override off wins over it", async () => {
    const { isEnabled } = await import("@/lib/flags/flags");
    store.globals = [{ key: "report_v2", value: true }];
    expect(await isEnabled("report_v2", null)).toBe(true);
    expect(await isEnabled("report_v2", ORG)).toBe(true);
    store.overrides = [{ flagKey: "report_v2", isEnabled: false, expiresAt: null }];
    expect(await isEnabled("report_v2", ORG)).toBe(false);
  });

  it("an override on turns a flag on for that workspace while it's off globally", async () => {
    const { isEnabled } = await import("@/lib/flags/flags");
    store.overrides = [{ flagKey: "visibility_reach", isEnabled: true, expiresAt: null }];
    expect(await isEnabled("visibility_reach", ORG)).toBe(true);
    expect(await isEnabled("visibility_reach", null)).toBe(false);
    expect(await isEnabled("report_v2", ORG)).toBe(false);
  });

  it("reads the override under that workspace's own RLS context", async () => {
    const { isEnabled } = await import("@/lib/flags/flags");
    await isEnabled("report_v2", ORG);
    expect(store.rlsOrgIds).toEqual([ORG]);
  });

  it("an expired override is none: the global value decides", async () => {
    const { isEnabled } = await import("@/lib/flags/flags");
    store.overrides = [
      { flagKey: "report_v2", isEnabled: true, expiresAt: new Date(Date.now() - 60_000) },
    ];
    expect(await isEnabled("report_v2", ORG)).toBe(false);
    store.globals = [{ key: "report_v2", value: true }];
    store.overrides = [
      { flagKey: "report_v2", isEnabled: false, expiresAt: new Date(Date.now() - 60_000) },
    ];
    expect(await isEnabled("report_v2", ORG)).toBe(true);
  });

  it("a stored value that isn't true or false counts as unset (off)", async () => {
    const { isEnabled } = await import("@/lib/flags/flags");
    store.globals = [{ key: "report_v2", value: "true" }];
    expect(await isEnabled("report_v2", null)).toBe(false);
  });

  it("a flag the store can't read is off, and the failure is logged", async () => {
    const { isEnabled } = await import("@/lib/flags/flags");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    store.globals = [{ key: "report_v2", value: true }];
    store.fail = true;
    expect(await isEnabled("report_v2", ORG)).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"event":"feature_flag_read_failed"'),
    );
  });
});

describe("the settings store's flag functions (lib/governance/google-surfaces.ts)", () => {
  it("refuse a Google setting's key or a Google override key: a flag can't change what Google AI does", async () => {
    const gs = await import("@/lib/governance/google-surfaces");
    for (const key of [
      ...Object.values(gs.GOOGLE_SETTING_KEYS),
      ...Object.values(gs.GOOGLE_SURFACE_FLAG_KEYS),
    ]) {
      await expect(gs.readFeatureFlagSettings(["report_v2", key])).rejects.toThrow(
        /Not a feature flag/,
      );
      await expect(gs.saveFeatureFlagSetting(key, true, false, null)).rejects.toThrow(
        /Not a feature flag/,
      );
    }
  });

  it("read only the keys asked for", async () => {
    const gs = await import("@/lib/governance/google-surfaces");
    store.globals = [{ key: "report_v2", value: true }];
    expect(await gs.readFeatureFlagSettings(["report_v2"])).toEqual(new Map([["report_v2", true]]));
  });
});
