import type { Page } from "@playwright/test";

export async function signInAsTestUser(page: Page) {
  await page.goto("/sign-in");
  await page.fill('input[type="email"]', process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local");
  await page.fill('input[type="password"]', process.env.E2E_TEST_USER_PASSWORD ?? "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("/dashboard");
}

export async function signInAsTestUser2(page: Page) {
  await page.goto("/sign-in");
  await page.fill(
    'input[type="email"]',
    process.env.E2E_TEST_USER_2_EMAIL ?? "user2@visibleau.local",
  );
  await page.fill('input[type="password"]', process.env.E2E_TEST_USER_2_PASSWORD ?? "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("/dashboard");
}
