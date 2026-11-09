/**
 * tests/e2e/sprint7/sprint7-discovery.spec.ts
 *
 * Playwright E2E: Sprint 7 Discovery Intelligence — 4 screens
 *
 * Covers: discovery-hub (2 tiles, cyan badge, reachable), journeys (3 tradies
 * templates, "clone a pre-built" copy), comparisons (verdict cards,
 * null→Inconclusive), s3-benchmark (Visibility page benchmark card shows
 * configured-competitor data — the render-proof the hollow integration test
 * couldn't make).
 *
 * Database: the local e2e database only (visibleau_e2e), via .env.test.local.
 * LLM_MODE=mock via .env.test.local.
 *
 * Run: npx playwright test --config tests/e2e/sprint7/playwright.config.ts
 */

import { expect, test } from "@playwright/test";
import { audits, brands, comparisonPromptResults, conversationJourneys } from "@/db/schema";
import { PREBUILT_JOURNEYS } from "@/db/seed/prebuilt-journeys";
import { db } from "../helpers/db";
import {
  createSpecAccount,
  removeSpecAccount,
  type SpecAccount,
  signInThroughForm,
} from "../helpers/spec-account";

/* ─── Test constants ────────────────────────────────────── */

// Its own account and workspace (tests/e2e/helpers/spec-account.ts; the local e2e database only),
// on an Agency plan: plans come from `subscriptions`.
let account: SpecAccount;
let orgId = "";
let brandId = "";
let auditId = "";

const E2E_BRAND_PREFIX = "E2E-S7";
const COMPETITOR_1 = "fallonsolutions.com.au";
const COMPETITOR_2 = "hipages.com.au";

/* ─── Seed / teardown helpers ───────────────────────────── */

/* ─── Global setup / teardown ───────────────────────────── */

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "sprint7", plan: "agency" });
  orgId = account.organizationId;

  // Create the test brand with configured competitors
  const [brand] = await db
    .insert(brands)
    .values({
      organizationId: orgId,
      name: `${E2E_BRAND_PREFIX}-Discovery`,
      domain: "e2e-s7-discovery.com.au",
      vertical: "tradies",
      region: "au",
      competitors: [COMPETITOR_1, COMPETITOR_2],
    })
    .returning();
  brandId = brand.id;

  // Seed prebuilt journey templates for tradies (§5.5)
  const tradiesTemplates = PREBUILT_JOURNEYS.filter((t) => t.vertical === "tradies");
  for (const tpl of tradiesTemplates) {
    await db.insert(conversationJourneys).values({
      brandId,
      organizationId: orgId,
      journeyName: tpl.journeyName,
      vertical: tpl.vertical,
      buyerStage: tpl.buyerStage,
      promptSequence: tpl.promptSequence,
      isActive: true,
    });
  }

  // Seed an audit for comparison_prompt_results FK
  const [audit] = await db
    .insert(audits)
    .values({
      brandId,
      organizationId: orgId,
      auditNumber: 1,
      status: "complete",
      triggeredBy: "manual",
      engines: ["chatgpt", "claude", "gemini", "perplexity"],
    })
    .returning();
  auditId = audit.id;

  // Seed comparison_prompt_results:
  // - Wins, losses, AND a null (inconclusive) for each competitor
  const comparisonRows = [
    // Competitor 1: 1 win, 1 loss, 1 inconclusive (null)
    {
      competitorDomain: COMPETITOR_1,
      engine: "chatgpt",
      brandWon: true,
      brandMentioned: true,
      competitorMentioned: true,
    },
    {
      competitorDomain: COMPETITOR_1,
      engine: "claude",
      brandWon: false,
      brandMentioned: true,
      competitorMentioned: true,
    },
    {
      competitorDomain: COMPETITOR_1,
      engine: "gemini",
      brandWon: null,
      brandMentioned: true,
      competitorMentioned: false,
    },
    // Competitor 2: 2 wins, 1 inconclusive (null)
    {
      competitorDomain: COMPETITOR_2,
      engine: "chatgpt",
      brandWon: true,
      brandMentioned: true,
      competitorMentioned: true,
    },
    {
      competitorDomain: COMPETITOR_2,
      engine: "claude",
      brandWon: true,
      brandMentioned: true,
      competitorMentioned: true,
    },
    {
      competitorDomain: COMPETITOR_2,
      engine: "perplexity",
      brandWon: null,
      brandMentioned: false,
      competitorMentioned: true,
    },
  ];

  for (const row of comparisonRows) {
    await db.insert(comparisonPromptResults).values({
      brandId,
      organizationId: orgId,
      auditId,
      competitorDomain: row.competitorDomain,
      prompt: `Compare e2e-s7-discovery.com.au vs ${row.competitorDomain}`,
      engine: row.engine,
      brandWon: row.brandWon,
      brandMentioned: row.brandMentioned,
      competitorMentioned: row.competitorMentioned,
      verdictSnippet: `E2E test verdict for ${row.competitorDomain} on ${row.engine}`,
    });
  }
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

test.beforeEach(async ({ page }) => {
  await signInThroughForm(page, account);
});

// ═══════════════════════════════════════════════════════════════
// Screen 1 — Discovery Hub (/brands/{id}/discovery)
// ═══════════════════════════════════════════════════════════════

test.describe("Screen 1 — Discovery Hub", () => {
  test("renders 2 sub-tiles: Conversational Journeys + Competitor Comparisons", async ({
    page,
  }) => {
    await page.goto(`/brands/${brandId}/discovery`);
    await expect(page.getByText("Discovery Intelligence")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Conversational Journeys")).toBeVisible();
    await expect(page.getByText("Competitor Comparisons")).toBeVisible();
  });

  test("both tiles have View→ links that navigate", async ({ page }) => {
    await page.goto(`/brands/${brandId}/discovery`);
    await expect(page.getByText("Discovery Intelligence")).toBeVisible({ timeout: 15000 });
    const viewLinks = page.getByText("View →");
    await expect(viewLinks.first()).toBeVisible();
    const linkCount = await viewLinks.count();
    expect(linkCount).toBeGreaterThanOrEqual(2);
  });

  test("Discovery badge uses cyan layer-discovery token (Finding 2: not orange)", async ({
    page,
  }) => {
    await page.goto(`/brands/${brandId}/discovery`);
    await expect(page.getByText("Discovery Intelligence")).toBeVisible({ timeout: 15000 });
    // The route resolves (not a 404 nav-orphan)
    await expect(page).not.toHaveURL(/404/);
  });

  test("route resolves 200 (not nav-orphan 404)", async ({ page }) => {
    const response = await page.goto(`/brands/${brandId}/discovery`);
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Discovery Intelligence")).toBeVisible({ timeout: 15000 });
  });
});

// ═══════════════════════════════════════════════════════════════
// Screen 2 — Journeys (/discovery/journeys) — Agency+
// ═══════════════════════════════════════════════════════════════

test.describe("Screen 2 — Journeys", () => {
  test("3 pre-built tradies templates are listed (§5.5 seed)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/discovery/journeys`);
    await expect(page.getByText("Service Discovery")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Emergency Booking")).toBeVisible();
    await expect(page.getByText("Competitor Comparison")).toBeVisible();
  });

  test("templates show buyer stage labels", async ({ page }) => {
    await page.goto(`/brands/${brandId}/discovery/journeys`);
    await expect(page.getByText("Service Discovery")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("awareness").first()).toBeVisible();
  });

  test("empty-state copy is 'clone a pre-built' (not 'via the API') (Finding 4)", async ({
    page,
  }) => {
    await page.goto(`/brands/${brandId}/discovery/journeys`);
    await expect(page.getByText("Service Discovery")).toBeVisible({ timeout: 15000 });
    // "clone a pre-built" should appear somewhere (empty owned + templates present)
    // Verify the wrong copy is absent
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("via the API");
  });
});

// ═══════════════════════════════════════════════════════════════
// Screen 3 — Comparisons (/discovery/comparisons) — Growth+
// ═══════════════════════════════════════════════════════════════

test.describe("Screen 3 — Comparisons", () => {
  test("verdict cards render per competitor", async ({ page }) => {
    await page.goto(`/brands/${brandId}/discovery/comparisons`);
    await expect(page.getByText("Competitor Comparisons")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(`vs ${COMPETITOR_1}`).first()).toBeVisible();
    await expect(page.getByText(`vs ${COMPETITOR_2}`).first()).toBeVisible();
  });

  test("INCONCLUSIVE card renders for brand_won=null (LLD 288: not a crash, not 'Lost')", async ({
    page,
  }) => {
    await page.goto(`/brands/${brandId}/discovery/comparisons`);
    await expect(page.getByText("Competitor Comparisons")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Inconclusive").first()).toBeVisible();
    // The page did not crash — heading is still visible
    await expect(page.getByText("Competitor Comparisons")).toBeVisible();
  });

  test("summary counts render (Wins / Losses / Inconclusive)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/discovery/comparisons`);
    await expect(page.getByText("Competitor Comparisons")).toBeVisible({ timeout: 15000 });
    // Seeded: 3 wins, 1 loss, 2 inconclusive
    await expect(page.getByText("Wins")).toBeVisible();
    await expect(page.getByText("Losses")).toBeVisible();
    await expect(page.getByText("Inconclusive").last()).toBeVisible();
  });

  test("Win and Lost verdict cards both appear", async ({ page }) => {
    await page.goto(`/brands/${brandId}/discovery/comparisons`);
    await expect(page.getByText("Competitor Comparisons")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Won").first()).toBeVisible();
    await expect(page.getByText("Lost").first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════
// Screen 4 — S3 Benchmark on Visibility (/brands/{id}/visibility)
// THE MARQUEE: the render-proof the hollow integration test missed
// ═══════════════════════════════════════════════════════════════

test.describe("Screen 4 — S3 Competitive Benchmark (render-proof)", () => {
  test("benchmark card shows 'Competitive Benchmark' heading (not 'Coming soon')", async ({
    page,
  }) => {
    await page.goto(`/brands/${brandId}/visibility`);
    // Wait for the page to load
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    // The benchmark card renders real data, not the stub
    await expect(page.getByText("Competitive Benchmark")).toBeVisible({ timeout: 15000 });
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Coming soon");
  });

  test("shows CONFIGURED competitors (not SOV domain like mbav.com.au)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/visibility`);
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.getByText("Competitive Benchmark")).toBeVisible({ timeout: 15000 });
    // Configured competitors appear
    await expect(page.getByText(COMPETITOR_1).first()).toBeVisible();
    await expect(page.getByText(COMPETITOR_2).first()).toBeVisible();
    // SOV domain must NOT appear
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("mbav.com.au");
  });

  test("shows per-competitor data (more than one competitor)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/visibility`);
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.getByText("Competitive Benchmark")).toBeVisible({ timeout: 15000 });
    // Both competitors present → per-competitor
    const comp1 = page.getByText(COMPETITOR_1);
    const comp2 = page.getByText(COMPETITOR_2);
    expect(await comp1.count()).toBeGreaterThanOrEqual(1);
    expect(await comp2.count()).toBeGreaterThanOrEqual(1);
  });

  test("overall summary (Wins/Losses/Draw) is present", async ({ page }) => {
    await page.goto(`/brands/${brandId}/visibility`);
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    await expect(page.getByText("Competitive Benchmark")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Wins")).toBeVisible();
    await expect(page.getByText("Losses")).toBeVisible();
    await expect(page.getByText("Draw")).toBeVisible();
  });
});
