/**
 * vitest.config.e2e.ts — Sprint 3 backend E2E
 *
 * Run: LLM_MODE=mock npx vitest run --config vitest.config.e2e.ts \
 *        tests/e2e/backend/sprint3/
 */

import { defineConfig } from 'vitest/config';
import tsconfigPaths    from 'vite-tsconfig-paths';
import dotenv           from 'dotenv';
import path             from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name:        'sprint3-backend-e2e',
    environment: 'node',
    globals:     true,
    include:     ['tests/e2e/backend/sprint3/**/*.test.ts'],
    // A1 FIX: maxForks is not a valid Vitest config field and is silently ignored,
    // leaving tests potentially running in parallel and causing shared-DB collisions.
    // Correct pattern: pool:'forks' + singleFork:true forces strict sequential execution.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,   // one worker, sequential — shared DB + stateful MockLLM callCount
      },
    },
    testTimeout: 120_000,    // Sprint 3 full flow: up to 200 mock LLM calls
    hookTimeout:  30_000,
    setupFiles:  ['tests/e2e/backend/sprint3/helpers/setup.ts'],
  },
});
