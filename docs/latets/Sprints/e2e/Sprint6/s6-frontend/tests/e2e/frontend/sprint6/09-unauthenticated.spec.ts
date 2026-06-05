/**
 * 09-unauthenticated.spec.ts
 *
 * Sprint 6 §13 — Unauthenticated users are redirected to /sign-in.
 *
 * H4 FIX: Separated from the combined 07-09 file. baseTest (no auth) must not
 * share file scope with authenticated fixture hooks — the unauthenticated tests
 * have no beforeAll/afterAll and should run completely independently.
 */
import { test as baseTest, expect } from '@playwright/test';

// ─── FE-S6-53 — Unauthenticated list redirect ─────────────────────────────────

baseTest('FE-S6-53: unauthenticated /action-center redirects to /sign-in', async ({ page }) => {
  await page.goto('/action-center');
  await expect(page).toHaveURL(/sign-in/);
});

// ─── FE-S6-54 — Unauthenticated detail redirect ───────────────────────────────

baseTest('FE-S6-54: unauthenticated /action-center/[id] redirects to /sign-in', async ({ page }) => {
  await page.goto('/action-center/00000000-0000-0000-0000-000000000001');
  await expect(page).toHaveURL(/sign-in/);
});
