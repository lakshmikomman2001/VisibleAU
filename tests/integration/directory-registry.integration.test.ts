/**
 * S00 part 5 (22 Nov; migration 0153, directory registry): the directory_registry table on a real database.
 * - the migration seeded it with lib/directories/registry.ts's seed, row for row;
 * - lib/directories/registry-store.ts reads it: a row added to the table is a directory once read (and gone once
 *   removed), every function of the registry reading what was loaded;
 * - its checks refuse a kind, a market or a pattern it doesn't know;
 * - visibleau_app can read it (it has the same grants as every table: prod-fix 0052's DML).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const TEMP = "s00-test-directory.com.au";
let su: ReturnType<typeof postgres>;

beforeAll(() => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  su = postgres(url, { max: 1 });
});

afterAll(async () => {
  await su`DELETE FROM directory_registry WHERE domain_pattern = ${TEMP}`;
  const { resetDirectoryRegistry } = await import("@/lib/directories/registry");
  resetDirectoryRegistry();
  await su.end();
});

describe("directory_registry (real database)", () => {
  it("holds the seed, row for row", async () => {
    const { DIRECTORY_REGISTRY_SEED } = await import("@/lib/directories/registry");
    const rows = await su<
      {
        domain_pattern: string;
        directory_key: string;
        name: string;
        kind: string;
        market: string;
        applies_to: string;
        profile_url_hint: string | null;
        active: boolean;
        sort_order: number;
      }[]
    >`SELECT domain_pattern, directory_key, name, kind, market, applies_to, profile_url_hint, active, sort_order
      FROM directory_registry WHERE domain_pattern <> ${TEMP} ORDER BY sort_order`;
    expect(
      rows.map((r) => ({
        domainPattern: r.domain_pattern,
        directoryKey: r.directory_key,
        name: r.name,
        kind: r.kind,
        market: r.market,
        appliesTo: r.applies_to,
        profileUrlHint: r.profile_url_hint,
        active: r.active,
        sortOrder: r.sort_order,
      })),
    ).toEqual([...DIRECTORY_REGISTRY_SEED]);
  });

  it("what the table holds is what the registry knows, once read", async () => {
    const { loadDirectoryRegistry } = await import("@/lib/directories/registry-store");
    const { findDirectoryByDomain, getDirectoriesForMarket } = await import(
      "@/lib/directories/registry"
    );
    await su`
      INSERT INTO directory_registry (domain_pattern, directory_key, name, kind, market, applies_to, sort_order)
      VALUES (${TEMP}, 's00_test_directory', 'S00 Test Directory', 'general', 'au', 'cited', 9999)
    `;
    await loadDirectoryRegistry({ force: true });
    expect(findDirectoryByDomain(TEMP)).toMatchObject({
      key: "s00_test_directory",
      kind: "general",
    });
    expect(getDirectoriesForMarket("AU_EN").at(-1)?.key).toBe("s00_test_directory");
    await su`DELETE FROM directory_registry WHERE domain_pattern = ${TEMP}`;
    await loadDirectoryRegistry({ force: true });
    expect(findDirectoryByDomain(TEMP)).toBeNull();
    expect(findDirectoryByDomain("hipages.com.au")?.key).toBe("hipages");
  });

  it("refuses a kind, a market, a scope or a pattern it doesn't know", async () => {
    for (const [pattern, kind, market, applies] of [
      ["bad-kind.com.au", "forum", "au", "cited"],
      ["bad-market.com.au", "general", "nz", "cited"],
      ["bad-scope.com.au", "general", "au", "everyone"],
      ["https://bad-pattern.com.au", "general", "au", "cited"],
      ["Bad-Case.com.au", "general", "au", "cited"],
    ] as const) {
      await expect(
        su`INSERT INTO directory_registry (domain_pattern, directory_key, name, kind, market, applies_to, sort_order)
           VALUES (${pattern}, 'bad', 'Bad', ${kind}, ${market}, ${applies}, 1)`,
        pattern,
      ).rejects.toThrow(/check constraint/);
    }
  });

  it("visibleau_app can read it (and has every table's grants)", async () => {
    const [row] = await su<{ can_read: boolean; dml: boolean }[]>`
      SELECT has_table_privilege('visibleau_app', 'directory_registry', 'SELECT') AS can_read,
             has_table_privilege('visibleau_app', 'directory_registry', 'SELECT,INSERT,UPDATE,DELETE') AS dml`;
    expect(row).toEqual({ can_read: true, dml: true });
  });
});
