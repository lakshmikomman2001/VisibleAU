/**
 * S01B part 3 (LLD amendment 50): the integration workers refuse the network too (tests/no-network.setup.ts), but
 * keep the test database: its host is allowed from the project's own DATABASE_URL. An outbound fetch -- the kind S01
 * Part 9's real runners made (a crawl, a Wikipedia search) -- fails fast with the guard's message. Reserved names
 * only (.invalid), so nothing here reaches anyone even without the guard.
 */
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import {
  isAllowedHost,
  NO_NETWORK_MESSAGE,
  takeNetworkAttempts,
} from "@/tests/helpers/no-network-guard";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const sql = postgres(getTestDatabaseUrl(), { max: 1 });

afterAll(async () => {
  await sql.end();
});

describe("the network guard in the integration project", () => {
  it("the test database stays reachable, and its host is the one allowed", async () => {
    const [row] = await sql<{ one: number }[]>`SELECT 1 AS one`;
    expect(row.one).toBe(1);
    expect(isAllowedHost(new URL(getTestDatabaseUrl()).hostname)).toBe(true);
  });

  it("an outbound fetch fails fast with the guard's message, naming the host", async () => {
    const started = Date.now();
    const error = await fetch("https://crawl-check.invalid/").then(
      () => null,
      (e: Error & { cause?: Error }) => e,
    );
    expect(Date.now() - started).toBeLessThan(1000);
    expect(error?.cause?.message).toContain("crawl-check.invalid");
    expect(error?.cause?.message).toContain(NO_NETWORK_MESSAGE);
    expect(takeNetworkAttempts().map((a) => a.host)).toEqual(["crawl-check.invalid"]);
  });
});
