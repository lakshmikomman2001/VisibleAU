/**
 * Runs in every "unit" and "integration" worker before its test file (vitest.config.ts setupFiles): tests never reach
 * the network (S01B part 3, LLD amendment 50). Only this machine and the test database's host are reachable; every
 * other connection or DNS query fails fast with "tests must not reach the network; record a fixture", and fails the
 * test that made it. See tests/helpers/no-network-guard.ts.
 */
import { relative } from "node:path";
import { afterAll, afterEach, expect } from "vitest";
import {
  allowNetworkHosts,
  assertNoNetworkAttempts,
  databaseHostsIn,
  installNoNetworkGuard,
} from "./helpers/no-network-guard";

// The integration project's database (its env names it); the unit project has none (no-database.setup.ts removes it).
allowNetworkHosts(databaseHostsIn(process.env));

installNoNetworkGuard(() => {
  const { testPath, currentTestName } = expect.getState();
  const file = testPath ? relative(process.cwd(), testPath).replace(/\\/g, "/") : "a test file";
  return currentTestName ? `${file} > ${currentTestName}` : file;
});

afterEach(() => assertNoNetworkAttempts());
afterAll(() => assertNoNetworkAttempts());
