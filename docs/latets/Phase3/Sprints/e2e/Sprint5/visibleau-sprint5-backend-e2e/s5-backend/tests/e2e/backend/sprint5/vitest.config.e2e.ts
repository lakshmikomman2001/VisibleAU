/**
 * tests/e2e/backend/sprint5/vitest.config.e2e.ts
 */
import { defineConfig } from 'vitest/config';
import tsconfigPaths   from 'vite-tsconfig-paths';
import { config }      from 'dotenv';
import path            from 'node:path';

config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include:     ['tests/e2e/backend/sprint5/**/*.test.ts'],
    environment: 'node',
    // Sequential — tests share DB and some seed state
    pool:        'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // 'verbose' prints human-readable output to the terminal during the run.
    // 'json' writes machine-parseable results to outputFile.json for CI integration.
    // outputFile must be an object mapping reporter name to path when multiple reporters
    // are used — a plain string only routes to the first reporter and ignores the rest.
    reporters:   ['verbose', 'json'],
    outputFile:  { json: 'tests/e2e/backend/sprint5/reports/results.json' },
  },
});
