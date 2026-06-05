/**
 * tests/e2e/frontend/sprint4/helpers/global-teardown.ts
 * Runs once after all tests — currently a no-op.
 * Each spec file's afterAll handles its own data cleanup.
 */
export default async function globalTeardown(): Promise<void> {
  // Per-spec afterAll blocks handle teardown.
  // Add any global cleanup here if needed.
}
