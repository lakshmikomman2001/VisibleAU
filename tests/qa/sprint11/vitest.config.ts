import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    testTimeout:  30_000,
    hookTimeout:  30_000,
    reporters:  ['verbose'],
    root: __dirname,
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.spec.ts'],
  },
});
