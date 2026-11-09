/**
 * A dev server for the Playwright specs, from `.env.test.local` only, against the local e2e database
 * only: what every Playwright config starts itself (tests/e2e/helpers/e2e-config.ts). Start it yourself
 * to keep one warm server across several spec runs, then run each spec with E2E_REUSE_SERVER=1:
 *
 *   pnpm e2e:server
 *   E2E_REUSE_SERVER=1 npx playwright test --config tests/e2e/sprint8/playwright.config.ts
 *
 * Never reuse a server started any other way: `pnpm dev` reads `.env.local` (visibleau_prod, live keys).
 */
import { spawn } from "node:child_process";
import {
  E2E_PORT,
  E2E_SERVER_ENV,
  loadE2eEnv,
  REPO_ROOT,
} from "../../tests/e2e/helpers/e2e-config";

loadE2eEnv();

const child = spawn(`npx next dev --port ${E2E_PORT}`, {
  cwd: REPO_ROOT,
  env: { ...process.env, ...E2E_SERVER_ENV },
  shell: true,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
