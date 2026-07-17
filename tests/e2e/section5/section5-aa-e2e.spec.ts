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

import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import {
  db,
  ensureOrganization,
  ensureUser,
} from "../helpers/db";
import {
  subscriptions,
  brands,
  crawlerVisitLogs,
  remediationTasks,
} from "@/db/schema";

/* ─── Database safety ──────────────────────────────────────── */

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("visibleau_prod")) {
  throw new Error(
    "FATAL: DATABASE_URL points to PROD (visibleau_prod). " +
      "Section 5 E2E must run against DEV. Load .env.test.local.",
  );
}

/* ─── Constants ────────────────────────────────────────────── */

const USER_1_CLERK = process.env.E2E_TEST_USER_1_CLERK_ID ?? "user_e2e_s5_1";
const ORG_1_CLERK = process.env.E2E_TEST_ORG_1_CLERK_ID ?? "org_e2e_s5_1";
const USER_2_CLERK = process.env.E2E_TEST_USER_2_CLERK_ID ?? "user_e2e_s5_2";
const ORG_2_CLERK = process.env.E2E_TEST_ORG_2_CLERK_ID ?? "org_e2e_s5_2";

const PREFIX = "E2E-S5";
const TASK_TITLE = "Add a sitemap so AI crawlers can discover your pages";

let org1Id = "";
let org2Id = "";
let brandId = "";

/* ─── Auth helper ──────────────────────────────────────────── */

async function signIn(page: Page, email?: string, password?: string) {
  await page.goto("/sign-in");
  await page.fill(
    'input[type="email"]',
    email ?? process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local",
  );
  await page.fill(
    'input[type="password"]',
    password ?? process.env.E2E_TEST_USER_PASSWORD ?? "password123",
  );
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", {
    timeout: 30_000,
    waitUntil: "domcontentloaded",
  });
}

/* ─── DB seed helpers ──────────────────────────────────────── */

async function ensureSub(orgId: string, tier: string) {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, orgId));

  if (existing) {
    if (existing.tier !== tier) {
      await db
        .update(subscriptions)
        .set({ tier, updatedAt: new Date() })
        .where(eq(subscriptions.id, existing.id));
    }
    return;
  }
  await db.insert(subscriptions).values({
    organizationId: orgId,
    stripeCustomerId: `cus_e2e_s5_${orgId.slice(0, 8)}`,
    stripeSubscriptionId: `sub_e2e_s5_${Date.now()}`,
    stripePriceId: "price_e2e_s5_test",
    tier,
    billingInterval: "monthly",
    status: "active",
  });
}

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

async function cleanupBrand(bId: string) {
  await db
    .delete(remediationTasks)
    .where(eq(remediationTasks.brandId, bId))
    .catch(() => {});
  await db
    .delete(crawlerVisitLogs)
    .where(eq(crawlerVisitLogs.brandId, bId))
    .catch(() => {});
  await db
    .delete(brands)
    .where(eq(brands.id, bId))
    .catch(() => {});
}

async function cleanupTasks(bId: string) {
  await db
    .delete(remediationTasks)
    .where(eq(remediationTasks.brandId, bId))
    .catch(() => {});
}

/* ─── SETUP / TEARDOWN ─────────────────────────────────────── */

test.beforeAll(async () => {
  const org = await ensureOrganization({
    clerkOrgId: ORG_1_CLERK,
    name: `${PREFIX} Org 1`,
    tier: "growth",
  });
  org1Id = org.id;

  const org2 = await ensureOrganization({
    clerkOrgId: ORG_2_CLERK,
    name: `${PREFIX} Org 2`,
    tier: "growth",
  });
  org2Id = org2.id;

  await ensureUser({
    clerkUserId: USER_1_CLERK,
    organizationId: org1Id,
    email: process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local",
  });
  await ensureUser({
    clerkUserId: USER_2_CLERK,
    organizationId: org2Id,
    email: process.env.E2E_TEST_USER_2_EMAIL ?? "user2@visibleau.local",
  });

  await ensureSub(org1Id, "growth");
  await ensureSub(org2Id, "growth");

  // Clean up leftover E2E brands from previous runs
  const existing = await db
    .select()
    .from(brands)
    .where(eq(brands.organizationId, org1Id));
  for (const b of existing) {
    if (b.name.startsWith(PREFIX)) {
      await cleanupBrand(b.id);
    }
  }

  brandId = await seedBrand(org1Id);
});

test.afterAll(async () => {
  if (brandId) await cleanupBrand(brandId);
});

/* ═══════════════════════════════════════════════════════════════
   STEP 1+2 — FIX-07 (task on board) + FIX-06 (correct banner)
   ═══════════════════════════════════════════════════════════════ */

test.describe("Steps 1+2 — Create task → correct banner → tile on board", () => {
  test.beforeEach(async () => {
    await cleanupTasks(brandId);
  });

  test("FIX-06+07: banner says 'Workflow', tile visible on board ON ARRIVAL", async ({
    page,
  }) => {
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
    const banner = page.locator(
      "text=Task created — see Workflow to track progress.",
    );
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
    await expect(
      openColumn.locator(`text=${TASK_TITLE}`),
    ).toBeVisible({ timeout: 10_000 });
  });
});

/* ═══════════════════════════════════════════════════════════════
   STEP 3 — Dedup: exactly 1 tile on double-create
   ═══════════════════════════════════════════════════════════════ */

test.describe("Step 3 — Dedup on repeat create", () => {
  test.beforeEach(async () => {
    await cleanupTasks(brandId);
  });

  test("re-create same finding → still exactly 1 task tile on the board", async ({
    page,
  }) => {
    await signIn(page);

    // ── First create ──
    await page.goto(`/brands/${brandId}/retrieval/agent-analytics`);
    await page.waitForSelector("text=Pages AI has never seen", {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(
      page.locator("text=Task created — see Workflow to track progress."),
    ).toBeVisible({ timeout: 10_000 });

    // ── Re-navigate to AA (resets component state → button clickable again) ──
    await page.goto(`/brands/${brandId}/retrieval/agent-analytics`);
    await page.waitForSelector("text=Pages AI has never seen", {
      timeout: 30_000,
    });

    // ── Second create (same recommendationKey → server returns 200 via dedup) ──
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(
      page.locator("text=Task created — see Workflow to track progress."),
    ).toBeVisible({ timeout: 10_000 });

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
  test("AA page loads — verification status + purpose split render", async ({
    page,
  }) => {
    await signIn(page);

    const response = await page.goto(
      `/brands/${brandId}/retrieval/agent-analytics`,
    );
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
    await expect(
      page.locator("text=Unverified rate exceeds 25%"),
    ).toBeVisible({ timeout: 5_000 });

    // Setup panel renders (3 ingestion cards)
    await expect(page.locator("text=Upload a log file")).toBeVisible();
    await expect(page.locator("text=Live snippet")).toBeVisible();

    // Connected state with hit count (10 seeded rows)
    await expect(page.locator("text=Connected.")).toBeVisible();
  });

  test("cross-org user cannot access another org's AA data", async ({
    page,
  }) => {
    await signIn(
      page,
      process.env.E2E_TEST_USER_2_EMAIL ?? "user2@visibleau.local",
      process.env.E2E_TEST_USER_2_PASSWORD ?? "password123",
    );

    await page.goto(`/brands/${brandId}/retrieval/agent-analytics`);
    await page.waitForLoadState("domcontentloaded");

    // Cross-org user should NOT see the brand's AA data
    await expect(
      page.locator("text=AI Crawler Activity"),
    ).not.toBeVisible({ timeout: 5_000 });
  });
});
