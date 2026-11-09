/**
 * Runs in every "unit" project worker before its test file (vitest.config.ts setupFiles): unit tests never
 * reach a database, whatever else ran in the same vitest process. See tests/helpers/no-database-guard.ts.
 */
import { relative } from "node:path";
import { afterAll, afterEach, expect } from "vitest";
import {
  assertNoDatabaseAttempts,
  forgetInheritedDatabaseEnv,
  installNoDatabaseGuard,
} from "../helpers/no-database-guard";

forgetInheritedDatabaseEnv();

installNoDatabaseGuard(() => {
  const { testPath, currentTestName } = expect.getState();
  const file = testPath
    ? relative(process.cwd(), testPath).replace(/\\/g, "/")
    : "a unit test file";
  return currentTestName ? `${file} > ${currentTestName}` : file;
});

afterEach(() => assertNoDatabaseAttempts());
afterAll(() => assertNoDatabaseAttempts());
