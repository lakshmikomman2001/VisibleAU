/**
 * SECTION 5 — Frontend E2E (Playwright: cross-route render flows)
 *
 * The test this whole session was building toward. It automates the exact
 * manual walk that caught FIX-06 (wrong banner destination) and FIX-07
 * (stale board — task not visible on arrival).
 *
 * Step 1 (FIX-07): Create task on AA page → navigate to Workflow board
 *                   → task tile visible ON ARRIVAL (no tab-switch/reload)
 * Step 2 (FIX-06): Banner says "see Workflow" not "see Action Center"
 * Step 3 (dedup):  Double-click → exactly one tile, not two
 * Step 4 (smoke):  AA page renders for owner (verification status, CDN verdicts)
 *
 * Database: DEV only (visibleau, NOT visibleau_prod).
 * LLM_MODE=mock via .env.test.local.
 *
 * Run: npx playwright test --config tests/e2e/section5/playwright.config.ts
 */

import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { brands, crawlerVisitLogs, remediationTasks } from "@/db/schema";
import { db } from "../helpers/db";
import {
  createSpecAccount,
  removeSpecAccount,
  type SpecAccount,
  signInThroughForm,
} from "../helpers/spec-account";

/* ─── Constants ────────────────────────────────────────────── */

const PREFIX = "E2E-S5";
const TASK_TITLE = "Add a sitemap so AI crawlers can discover your pages";

// Two accounts, each with its own workspace on a Growth plan (tests/e2e/helpers/spec-account.ts;
// the local e2e database only). User 2 is the cross-org check.
let user1: SpecAccount;
let user2: SpecAccount;
let org1Id = "";
let brandId = "";

/* ─── Auth helper ──────────────────────────────────────────── */

async function signIn(page: Page, account: SpecAccount = user1) {
  await signInThroughForm(page, account);
}

/* ─── DB seed helpers ──────────────────────────────────────── */

async function seedBrand(orgId: string): Promise<string> {
  const [brand] = await db
    .insert(brands)
    .values({
      organizationId: orgId,
      name: `${PREFIX} Metropolitan Plumbing`,
      vertical: "tradies",
      domain: "e2e-s5-metro.invalid",
      region: "au",
    })
    .returning();

  const now = new Date();
  for (let i = 0; i < 10; i++) {
    await db.insert(crawlerVisitLogs).values({
      brandId: brand.id,
      organizationId: orgId,
      crawlerName: "GPTBot",
      crawlerTier: "tier1",
      visitedUrl: `https://e2e-s5-metro.invalid/page-${i}`,
      statusCode: 200,
      isActiveAgent: true,
      visitPurpose: "retrieval",
      visitedAt: new Date(now.getTime() - i * 3_600_000),
      sourceIp: `198.51.100.${i + 1}`,
      verificationStatus: i < 2 ? "verified" : "unverified",
      verifiedVia: i < 2 ? "cidr" : null,
      ingestSource: "log_upload",
    });
  }

  return brand.id;
}

async function cleanupTasks(bId: string) {
  await db
    .delete(remediationTasks)
    .where(eq(remediationTasks.brandId, bId))
    .catch(() => {});
}

/* ─── SETUP / TEARDOWN ─────────────────────────────────────── */

test.beforeAll(async () => {
  user1 = await createSpecAccount({ key: "section5-user-1", plan: "growth" });
  user2 = await createSpecAccount({ key: "section5-user-2", plan: "growth" });
  org1Id = user1.organizationId;
  brandId = await seedBrand(org1Id);
});

test.afterAll(async () => {
  await removeSpecAccount(user1);
  await removeSpecAccount(user2);
});

/* ═══════════════════════════════════════════════════════════════
   STEP 1+2 — FIX-07 (task on board) + FIX-06 (correct banner)
   ═══════════════════════════════════════════════════════════════ */

test.describe("Steps 1+2 — Create task → correct banner → tile on board", () => {
  test.beforeEach(async () => {
    await cleanupTasks(brandId);
  });

  test("FIX-06+07: banner says 'Workflow', tile visible on board ON ARRIVAL", async ({ page }) => {
    await signIn(page);

    // ── Navigate to Agent Analytics page ──
    await page.goto(`/brands/${brandId}/retrieval/agent-analytics`);

    // Wait for coverage panel to render (growth tier → coverage API loads)
    await page.waitForSelector("text=Pages AI has never seen", {
      timeout: 30_000,
    });

    // ── Click "Create task" ──
    const createBtn = page.getByRole("button", { name: "Create task" });
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // ── FIX-06: banner says "see Workflow", NOT "see Action Center" ──
    const banner = page.locator("text=Task created — see Workflow to track progress.");
    await expect(banner).toBeVisible({ timeout: 10_000 });

    // Must NOT say "Action Center"
    await expect(page.locator("text=see Action Center")).not.toBeVisible();

    // ── FIX-07: navigate to Workflow board → tile visible ON ARRIVAL ──
    await page.goto(`/brands/${brandId}/workflow/tasks`);

    // Wait for the page header to confirm we arrived
    await expect(page.locator("text=Remediation Tasks")).toBeVisible({
      timeout: 15_000,
    });

    // FIX-07: task tile visible in the "Open" column ON ARRIVAL — no reload
    const openColumn = page.locator('[aria-label="Open column"]');
    await expect(openColumn.locator(`text=${TASK_TITLE}`)).toBeVisible({ timeout: 10_000 });
  });
});

/* ═══════════════════════════════════════════════════════════════
   STEP 3 — Dedup: exactly 1 tile on double-create
   ═══════════════════════════════════════════════════════════════ */

test.describe("Step 3 — Dedup on repeat create", () => {
  test.beforeEach(async () => {
    await cleanupTasks(brandId);
  });

  test("re-create same finding → still exactly 1 task tile on the board", async ({ page }) => {
    await signIn(page);

    // ── First create ──
    await page.goto(`/brands/${brandId}/retrieval/agent-analytics`);
    await page.waitForSelector("text=Pages AI has never seen", {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.locator("text=Task created — see Workflow to track progress.")).toBeVisible({
      timeout: 10_000,
    });

    // ── Re-navigate to AA (resets component state → button clickable again) ──
    await page.goto(`/brands/${brandId}/retrieval/agent-analytics`);
    await page.waitForSelector("text=Pages AI has never seen", {
      timeout: 30_000,
    });

    // ── Second create (same recommendationKey → server returns 200 via dedup) ──
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.locator("text=Task created — see Workflow to track progress.")).toBeVisible({
      timeout: 10_000,
    });

    // ── Navigate to Workflow board ──
    await page.goto(`/brands/${brandId}/workflow/tasks`);
    await expect(page.locator("text=Remediation Tasks")).toBeVisible({
      timeout: 15_000,
    });

    // Must be exactly 1 tile — not 2 (scope to desktop board to avoid mobile duplicate)
    const board = page.locator('[aria-label="Task board"]');
    const tiles = board.locator('[role="article"]').filter({ hasText: TASK_TITLE });
    await expect(tiles).toHaveCount(1, { timeout: 10_000 });
  });
});

/* ═══════════════════════════════════════════════════════════════
   STEP 4 — AA page renders for owner (smoke)
   ═══════════════════════════════════════════════════════════════ */

test.describe("Step 4 — AA surface smoke", () => {
  test("AA page loads — verification status + purpose split render", async ({ page }) => {
    await signIn(page);

    const response = await page.goto(`/brands/${brandId}/retrieval/agent-analytics`);
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);

    // Wait for the crawler card (proves overview loaded, not just setup panel)
    await expect(page.locator("text=AI Crawler Activity")).toBeVisible({
      timeout: 30_000,
    });

    // Verification status renders (3 distinct badges)
    await expect(page.locator("text=Verified").first()).toBeVisible();
    await expect(page.locator("text=Unverified").first()).toBeVisible();
    await expect(page.locator("text=Spoofed").first()).toBeVisible();

    // Purpose split renders
    await expect(page.locator("text=Retrieval").first()).toBeVisible();

    // >25% unverified rate → impersonation warning (8/10 = 80%)
    await expect(page.locator("text=Unverified rate exceeds 25%")).toBeVisible({ timeout: 5_000 });

    // Setup panel renders (3 ingestion cards)
    await expect(page.locator("text=Upload a log file")).toBeVisible();
    await expect(page.locator("text=Live snippet")).toBeVisible();

    // Connected state with hit count (10 seeded rows)
    await expect(page.locator("text=Connected.")).toBeVisible();
  });

  test("cross-org user cannot access another org's AA data", async ({ page }) => {
    await signIn(page, user2);

    await page.goto(`/brands/${brandId}/retrieval/agent-analytics`);
    await page.waitForLoadState("domcontentloaded");

    // Cross-org user should NOT see the brand's AA data
    await expect(page.locator("text=AI Crawler Activity")).not.toBeVisible({ timeout: 5_000 });
  });
});
