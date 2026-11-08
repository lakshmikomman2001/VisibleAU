/**
 * Mock-gate follow-ups (Sri, 2 Nov), part 1: the one place that reads LLM_MODE, and the one production check
 * for every mock shortcut. Mock mode answers from test fixtures and canned values -- the mock LLM, a fixed
 * brand classification (lib/brands/classify-brand.ts), an ABN "verified" without a lookup
 * (lib/trust/entity-checker.ts, ABN_LOOKUP_BYPASS=mock-verified in lib/brand-entity/abn-lookup.ts) -- and
 * none of that may ever reach a customer as a result.
 *
 * Production is NODE_ENV=production or Vercel's VERCEL_ENV=production. There:
 * - isMockMode() throws MockInProductionError when LLM_MODE=mock. Its call sites (the LLM factory, brand
 *   classification, the entity check's registry lookup) store what they return, so failing loudly -- the
 *   classification or check records an error and Inngest retries -- is safer than any stand-in answer.
 * - mockShortcutAllowed() returns false and logs an error. Its one call site, the ABN lookup during the
 *   technical audit, has an honest fallback ("check skipped"), and failing the whole audit over a stray
 *   env var would cost the customer more than the skipped check.
 * Local `next dev`, CI and vitest aren't production: everything behaves as before there.
 */

export class MockInProductionError extends Error {
  constructor() {
    super(
      "The mock LLM (LLM_MODE=mock) refuses to run in production: it answers from test fixtures, never a real engine. Set LLM_MODE=real, or remove it, in this deployment's environment.",
    );
    this.name = "MockInProductionError";
  }
}

export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

export function assertMockAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (isProductionRuntime(env)) throw new MockInProductionError();
}

/** LLM_MODE=mock, outside production. In production a mock setting throws MockInProductionError. */
export function isMockMode(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.LLM_MODE !== "mock") return false;
  assertMockAllowed(env);
  return true;
}

/** The raw LLM_MODE setting, for display and logging only (scripts, admin responses). Never branch on it. */
export function llmModeSetting(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.LLM_MODE;
}

/** A mock shortcut other than LLM_MODE (named in the log): allowed outside production; refused and logged in it. */
export function mockShortcutAllowed(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isProductionRuntime(env)) return true;
  console.error(
    JSON.stringify({
      event: "mock_shortcut_refused_in_production",
      shortcut: name,
      message: `${name} is a local-development shortcut; production refuses it and does the real thing, or says it was skipped.`,
    }),
  );
  return false;
}
