import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    testTimeout:  30_000,
    hookTimeout:  30_000,
    reporters:  ['verbose'],
    include: ['**/*.test.ts'],
    exclude: ['**/*.spec.ts'],
  },
});
