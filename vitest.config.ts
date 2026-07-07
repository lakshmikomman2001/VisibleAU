import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, defineProject } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      defineProject({
        plugins: [tsconfigPaths()],
        test: {
          name: "unit",
          environment: "node",
          globals: true,
          pool: "forks",
          include: [
            "tests/unit/**/*.test.{ts,tsx}",
            "tests/phase2/**/*.test.{ts,tsx}",
          ],
          exclude: ["**/*integration*"],
        },
      }),
      defineProject({
        plugins: [tsconfigPaths()],
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          pool: "forks",
          include: [
            "tests/phase2/**/*integration*.test.{ts,tsx}",
            "tests/integration/**/*.test.{ts,tsx}",
          ],
          fileParallelism: false,
        },
      }),
    ],
    coverage: {
      provider: "v8",
      include: ["lib/**", "app/api/**"],
      exclude: ["**/*.test.ts", "tests/**"],
    },
  },
});
