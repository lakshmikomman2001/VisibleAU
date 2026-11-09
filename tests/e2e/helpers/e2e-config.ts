/**
 * What every Playwright config shares: the env it loads, the database it accepts, and the dev server
 * it starts. Playwright-run follow-ups (9 Nov), part 1.
 *
 * - `.env.test.local` only, never `.env.local` (which points at visibleau_prod and holds live keys).
 *   The configs loaded `.env.test.local` into the runner, but `next dev` reads `.env.local` for every
 *   variable that file doesn't set, so the server picked up live AI, Supabase and analytics keys.
 *   With NODE_ENV=test, Next reads `.env.test.local`, `.env.test` and `.env` and skips `.env.local`
 *   (@next/env loadEnvConfig); the app only branches on NODE_ENV === "production", so nothing else
 *   changes.
 * - The local e2e database only: DATABASE_URL, DIRECT_URL and TEST_DATABASE_URL are each checked
 *   before any spec runs. Four folder configs fell back to the dev database.
 * - A server that's already listening is reused only when asked (E2E_REUSE_SERVER=1), and only one
 *   started with `pnpm e2e:server` should be: anything else on :3000 (a `pnpm dev` on `.env.local`)
 *   would answer the specs from another database while their helpers wrote to the e2e one.
 *
 * Relative imports only: tests/qa/* run under their own Playwright configs.
 */
import path from "node:path";
import { config } from "dotenv";
import { assertE2eDatabaseUrl } from "./e2e-database";

export const REPO_ROOT = path.resolve(__dirname, "../../..");
export const E2E_PORT = 3000;

/** What the dev server gets on top of the runner's environment. Not secrets: nothing else goes here. */
export const E2E_SERVER_ENV = {
  NODE_ENV: "test",
  LLM_MODE: "mock",
  STORAGE_DRIVER: "local",
} as const;

/** Loads `.env.test.local` and refuses to go on unless every database URL is the local e2e one. */
export function loadE2eEnv(): void {
  config({ path: path.join(REPO_ROOT, ".env.test.local"), quiet: true });
  for (const variable of ["DATABASE_URL", "DIRECT_URL", "TEST_DATABASE_URL"] as const) {
    const value = process.env[variable];
    if (variable === "DIRECT_URL" && !value) continue;
    assertE2eDatabaseUrl(value, variable);
  }
}

export function e2eBaseUrl(): string {
  return process.env.E2E_APP_URL ?? `http://localhost:${E2E_PORT}`;
}

/**
 * The dev server, from `.env.test.local` only. `env` holds only the overrides: Playwright starts the server
 * with `{ ...process.env, ...env }` itself, and its JSON and HTML reports serialise this config -- the 9 Nov
 * run's reports held the auth secret, test Stripe keys and Upstash token from a `{ ...process.env }` here
 * (Playwright-run follow-ups, part 6; tests/unit/e2e/playwright-reports.test.ts).
 */
export function e2eWebServer({ timeout = 180_000 }: { timeout?: number } = {}) {
  return {
    command: `npx next dev --port ${E2E_PORT}`,
    port: E2E_PORT,
    cwd: REPO_ROOT,
    timeout,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    env: { ...E2E_SERVER_ENV },
  };
}
