/**
 * tests/e2e/backend/sprint4/vitest.config.e2e.ts
 *
 * Run: LLM_MODE=mock npx vitest run \
 *        --config tests/e2e/backend/sprint4/vitest.config.e2e.ts \
 *        tests/e2e/backend/sprint4/
 */

import { defineConfig } from 'vitest/config';
import tsconfigPaths    from 'vite-tsconfig-paths';
import dotenv           from 'dotenv';
import path             from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name:        'sprint4-backend-e2e',
    environment: 'node',
    globals:     true,
    include:     ['tests/e2e/backend/sprint4/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,   // one worker, sequential — shared DB state
      },
    },
    testTimeout: 60_000,    // Sprint 4 tests use DB-seeded data; no Inngest needed
    hookTimeout: 30_000,
    setupFiles:  ['tests/e2e/backend/sprint4/helpers/setup.ts'],
  },
});
