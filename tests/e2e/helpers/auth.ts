import { test as base, type Page } from "@playwright/test";

export async function signInAsTestUser(page: Page) {
  await page.goto("/sign-in");
  await page.fill('input[type="email"]', process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local");
  await page.fill('input[type="password"]', process.env.E2E_TEST_USER_PASSWORD ?? "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
}

export async function signInAsTestUser2(page: Page) {
  await page.goto("/sign-in");
  await page.fill(
    'input[type="email"]',
    process.env.E2E_TEST_USER_2_EMAIL ?? "user2@visibleau.local",
  );
  await page.fill('input[type="password"]', process.env.E2E_TEST_USER_2_PASSWORD ?? "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 15000 });
}

export const USER_1 = {
  email: process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local",
  password: process.env.E2E_TEST_USER_PASSWORD ?? "password123",
};

export const USER_2 = {
  email: process.env.E2E_TEST_USER_2_EMAIL ?? "user2@visibleau.local",
  password: process.env.E2E_TEST_USER_2_PASSWORD ?? "password123",
};

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await signInAsTestUser(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
