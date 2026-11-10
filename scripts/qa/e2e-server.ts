/**
 * A dev server for the Playwright specs, from `.env.test.local` only, against the local e2e database
 * only: what every Playwright config starts itself (tests/e2e/helpers/e2e-config.ts). Start it yourself
 * to keep one warm server across several spec runs, then run each spec with E2E_REUSE_SERVER=1:
 *
 *   pnpm e2e:server
 *   E2E_REUSE_SERVER=1 npx playwright test --config tests/e2e/sprint8/playwright.config.ts
 *
 * Never reuse a server started any other way: `pnpm dev` reads `.env.local` (visibleau_prod, live keys).
 *
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 4 -- a cap. One of these grew to 8 GB while idle (9 Nov) on
 * a 15.4 GB machine, and a crashed run once left 926 workers holding 42 GB. Every minute this logs what the
 * server and every process under it (Turbopack's loader workers) hold, and stops the whole tree when that
 * passes E2E_SERVER_MAX_MB (default 6144; 0 turns the cap off). The log is also how to measure it idle:
 * start it, leave it ten minutes, read the lines.
 */
import { execFile, spawn } from "node:child_process";
import {
  E2E_PORT,
  E2E_SERVER_ENV,
  loadE2eEnv,
  REPO_ROOT,
} from "../../tests/e2e/helpers/e2e-config";
import { listProcesses, overCap, treeMemory } from "./process-tree";

loadE2eEnv();

const CAP_MB = Number(process.env.E2E_SERVER_MAX_MB ?? 6144);
const CHECK_EVERY_MS = 60_000;

const child = spawn(`npx next dev --port ${E2E_PORT}`, {
  cwd: REPO_ROOT,
  env: { ...process.env, ...E2E_SERVER_ENV },
  shell: true,
  stdio: "inherit",
});

/** Stops the server and everything under it (on Windows a shell's child would outlive the shell). */
function stopTree(): void {
  if (child.pid === undefined) return;
  if (process.platform === "win32") execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
  else child.kill("SIGTERM");
}

const started = Date.now();
const watchdog = setInterval(async () => {
  if (child.pid === undefined) return;
  try {
    const { mb, count } = treeMemory(await listProcesses(), child.pid);
    const minutes = Math.round((Date.now() - started) / 60_000);
    console.log(`[e2e-server] ${minutes} min: ${mb} MB in ${count} processes (cap ${CAP_MB} MB)`);
    if (overCap(mb, CAP_MB)) {
      console.error(
        `[e2e-server] stopping: ${mb} MB is over E2E_SERVER_MAX_MB (${CAP_MB}). Start it again for a fresh one.`,
      );
      stopTree();
    }
  } catch (error) {
    console.error(`[e2e-server] couldn't read the process list: ${String(error)}`);
  }
}, CHECK_EVERY_MS);

child.on("exit", (code) => {
  clearInterval(watchdog);
  process.exit(code ?? 0);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopTree();
    child.kill(signal);
  });
}
