import path from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const projectRoot = path.resolve(__dirname, '../../..');

export default defineConfig({
  plugins: [tsconfigPaths({ root: projectRoot })],
  resolve: {
    alias: {
      '@': projectRoot,
    },
  },
  test: {
    environment: 'node',
    testTimeout:  30_000,
    hookTimeout:  30_000,
    reporters:  ['verbose'],
    root: __dirname,
    include: ['features/**/*.spec.ts'],
    exclude: ['**/node_modules/**'],
  },
});
