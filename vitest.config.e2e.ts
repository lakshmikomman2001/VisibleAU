import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/e2e/backend/**/*.test.ts"],
    setupFiles: ["./tests/e2e/backend/setup.ts"],
    pool: "forks",
    maxForks: 1,
    testTimeout: 30000,
  },
});
