/**
 * tests/e2e/backend/sprint6/vitest.config.e2e.ts
 */
import { defineConfig } from 'vitest/config';
import tsconfigPaths   from 'vite-tsconfig-paths';
import { config }      from 'dotenv';
import path            from 'node:path';

config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include:     ['tests/e2e/backend/sprint6/**/*.test.ts'],
    environment: 'node',
    // Sequential — tests share DB and seed state; inline cleanup relies on ordering
    pool:        'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters:   ['verbose', 'json'],
    outputFile:  { json: 'tests/e2e/backend/sprint6/reports/results.json' },
  },
});
