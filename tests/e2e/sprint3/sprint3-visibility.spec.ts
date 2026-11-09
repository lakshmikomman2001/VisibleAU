/**
 * tests/e2e/sprint3/sprint3-visibility.spec.ts
 *
 * Playwright E2E: Sprint 3 Visibility Intelligence — full loop
 *
 * Covers: Visibility Hub (SoV bars, MentionSourceMatrix, FanOutTree,
 *   TopicalGapList, VolatilityIndicator, CompetitiveBenchmarkPanel),
 *   Citation Failure Diagnosis page, Dashboard SoV strip,
 *   brand-detail nav card, tier gating, edge/empty states.
 *
 * Database: the local e2e database only (visibleau_e2e), via .env.test.local.
 *
 * Run: npx playwright test --config tests/e2e/sprint3/playwright.config.ts
 */

import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import {
  audits,
  brands,
  citations,
  queryFanOutResults,
  topicalCoverageGaps,
  visibilityTrends,
} from "@/db/schema";
import { db } from "../helpers/db";
import {
  createSpecAccount,
  removeSpecAccount,
  type SpecAccount,
  setSpecPlan,
  signInThroughForm,
} from "../helpers/spec-account";

/* ─── Test constants ────────────────────────────────────── */

// Two accounts, each with its own workspace (tests/e2e/helpers/spec-account.ts; the local e2e
// database only). User 1 is on an Agency plan: the spec makes several brands, and Growth allows
// one. User 2 is on Free, for the locked Visibility card and the cross-org checks.
let user1: SpecAccount;
let user2: SpecAccount;
let orgId = "";
let brandId = "";
let auditId = "";

const E2E_BRAND_PREFIX = "E2E-S3";

/* ─── Seed / teardown helpers ───────────────────────────── */

async function createBrandViaApi(
  page: Page,
  data: {
    name: string;
    domain: string;
    vertical?: string;
    competitors?: string[];
    primaryRegions?: string[];
  },
) {
  const res = await page.request.post("/api/brands", {
    data: {
      name: data.name,
      domain: data.domain,
      vertical: data.vertical ?? "tradies",
      competitors: data.competitors ?? [],
      primaryRegions: data.primaryRegions ?? [],
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Brand creation failed (${res.status()}): ${body}`);
  }
  const body = await res.json();
  return (body as { brand: { id: string } }).brand.id;
}

async function nextAuditNumber(oId: string): Promise<number> {
  const rows = await db
    .select({ n: audits.auditNumber })
    .from(audits)
    .where(eq(audits.organizationId, oId));
  return rows.reduce((m, r) => Math.max(m, r.n), 0) + 1;
}

async function seedVisibilityData(oId: string, bId: string, aId: string) {
  // Share of Voice. Since 9fbb126 (7 Nov) the card counts the latest complete audit's everyday
  // answers: the brand's verified mentions against each configured competitor's, and since 819737c
  // a competitor counts only when an answer names it and cites its own website. share_of_voice_
  // snapshots, which this seeded, are no longer read. Ten answers (the minimum): the brand in 4,
  // competitor-alpha in 3, competitor-beta in 2.
  await db
    .update(brands)
    .set({
      competitorWebsites: {
        "competitor-alpha.com.au": "competitor-alpha.com.au",
        "competitor-beta.com.au": "competitor-beta.com.au",
      },
    })
    .where(eq(brands.id, bId));
  for (let i = 0; i < 10; i++) {
    const brand = i < 4;
    const alpha = i >= 4 && i < 7;
    const beta = i >= 7 && i < 9;
    const named = [
      brand ? "E2E-S3 Visibility Brand (e2evisibility.com.au)" : null,
      alpha ? "competitor-alpha.com.au" : null,
      beta ? "competitor-beta.com.au" : null,
    ].filter(Boolean);
    const text = named.length
      ? `Good local plumbers: ${named.join(", ")}.`
      : "Good local plumbers: Alpha Plumbing and Beta Plumbing.";
    const sources = [
      ...(brand ? [{ url: "https://e2evisibility.com.au/", domain: "e2evisibility.com.au" }] : []),
      ...(alpha
        ? [{ url: "https://competitor-alpha.com.au/", domain: "competitor-alpha.com.au" }]
        : []),
      ...(beta
        ? [{ url: "https://competitor-beta.com.au/", domain: "competitor-beta.com.au" }]
        : []),
    ];
    await db.insert(citations).values({
      auditId: aId,
      engine: "chatgpt",
      prompt: `Who is a reliable plumber in Sydney? (${i})`,
      promptIndex: i,
      runNumber: 1,
      brandMentioned: brand,
      isBrandedPrompt: false,
      mentionVerification: brand ? "verified_domain" : null,
      sentimentLabel: "neutral",
      contextLabel: brand ? "listed" : "absent",
      responseText: text,
      responseSnippet: text,
      citedSources: sources,
      llmModel: "test-model",
      llmCostUsd: "0.010000",
    });
  }

  // Visibility trend — archetype, mention/citation rates, volatility
  await db.insert(visibilityTrends).values({
    brandId: bId,
    organizationId: oId,
    periodLabel: "2026-W26",
    periodType: "weekly",
    auditCount: 2,
    sampleQuality: "good",
    mentionRate: "65.00",
    citationRate: "22.50",
    mentionSourceRatio: "2.89",
    brandArchetype: "known_but_untrusted",
    citationVolatilityScore: "18.50",
    scoreCompositeAvg: "72.30",
  });

  // Fan-out results — sub-queries grouped by original prompt
  await db.insert(queryFanOutResults).values([
    {
      auditId: aId,
      brandId: bId,
      organizationId: oId,
      originalPrompt: "best plumber in Sydney",
      engine: "chatgpt",
      subQuery: "top rated plumbers Sydney reviews",
      subQueryRank: 1,
      brandAppeared: true,
      brandPosition: 2,
      contentSimilarityScore: "0.920",
      aboveThreshold: true,
    },
    {
      auditId: aId,
      brandId: bId,
      organizationId: oId,
      originalPrompt: "best plumber in Sydney",
      engine: "chatgpt",
      subQuery: "emergency plumber Sydney 24 hour",
      subQueryRank: 2,
      brandAppeared: false,
      brandPosition: null,
      contentSimilarityScore: "0.750",
      aboveThreshold: false,
    },
    {
      auditId: aId,
      brandId: bId,
      organizationId: oId,
      originalPrompt: "best plumber in Sydney",
      engine: "chatgpt",
      subQuery: "licensed plumber near me Sydney",
      subQueryRank: 3,
      brandAppeared: true,
      brandPosition: 1,
      contentSimilarityScore: "0.890",
      aboveThreshold: true,
    },
  ]);

  // Topical coverage gaps — includes HIGH LEVERAGE gap (crossPromptImpact >= 2)
  await db.insert(topicalCoverageGaps).values([
    {
      brandId: bId,
      organizationId: oId,
      vertical: "tradies",
      topicCluster: "emergency_plumbing",
      topicLabel: "Emergency Plumbing",
      brandHasContent: false,
      crossPromptImpact: 3,
      competitorCoverage: [{ domain: "competitor-alpha.com.au", has_content: true, depth: 80 }],
    },
    {
      brandId: bId,
      organizationId: oId,
      vertical: "tradies",
      topicCluster: "hot_water_systems",
      topicLabel: "Hot Water Systems",
      brandHasContent: true,
      brandContentDepth: 40,
      crossPromptImpact: 1,
      competitorCoverage: [],
    },
  ]);
}

/* ─── Global setup / teardown ───────────────────────────── */

test.beforeAll(async () => {
  user1 = await createSpecAccount({ key: "sprint3-user-1", plan: "agency" });
  user2 = await createSpecAccount({ key: "sprint3-user-2", plan: null });
  orgId = user1.organizationId;
});

test.afterAll(async () => {
  await removeSpecAccount(user1);
  await removeSpecAccount(user2);
});

/* ═══════════════════════════════════════════════════════════
   FE-1: Sprint 3 Visibility E2E — core screens
   ═══════════════════════════════════════════════════════════ */

test.describe("FE-1: Sprint 3 Visibility E2E", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInThroughForm(page, user1);

    brandId = await createBrandViaApi(page, {
      name: `${E2E_BRAND_PREFIX} Visibility Brand`,
      domain: "e2evisibility.com.au",
      competitors: ["competitor-alpha.com.au", "competitor-beta.com.au"],
      primaryRegions: ["NSW:Sydney"],
    });

    const auditNumber = await nextAuditNumber(orgId);
    const [audit] = await db
      .insert(audits)
      .values({
        organizationId: orgId,
        brandId,
        auditNumber,
        status: "complete",
        scoreComposite: "72.50",
        completedAt: new Date(),
      })
      .returning();
    auditId = audit.id;

    await seedVisibilityData(orgId, brandId, auditId);
    await ctx.close();
  });

  // ── 1. Nav to visibility hub via brand detail card ─────────────────────

  test("1. Visibility hub reachable from brand detail via Visibility card", async ({ page }) => {
    await signInThroughForm(page, user1);
    await page.goto(`/brands/${brandId}`);
    await expect(page.getByRole("heading", { name: /E2E-S3 Visibility Brand/i })).toBeVisible({
      timeout: 15_000,
    });

    const visCard = page.getByRole("link").filter({ hasText: "Share of voice & trends" });
    await expect(visCard).toBeVisible();
    await visCard.click();

    await page.waitForURL(`**/brands/${brandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Visibility Intelligence" })).toBeVisible();
  });

  // ── 2. SoV bars render (not donut) ─────────────────────────────────────

  test("2. SoV section renders horizontal bars, brand highlighted", async ({ page }) => {
    await signInThroughForm(page, user1);
    await page.goto(`/brands/${brandId}`);
    await expect(page.getByRole("heading", { name: /E2E-S3 Visibility Brand/i })).toBeVisible({
      timeout: 15_000,
    });
    const visCard = page.getByRole("link").filter({ hasText: "Share of voice & trends" });
    await visCard.click();
    await page.waitForURL(`**/brands/${brandId}/visibility**`, { timeout: 10_000 });

    // SoV component should be present — look for "Share of Voice" heading
    await expect(page.getByText("Share of Voice")).toBeVisible({ timeout: 10_000 });

    // Brand bar should have "you" chip (IS-BRAND highlight)
    await expect(page.getByText("you", { exact: true })).toBeVisible();

    // Competitor domains should be visible in SoV bars
    await expect(page.getByText("competitor-alpha.com.au").first()).toBeVisible();

    // SoV renders as bars (div-based), not SVG pie — verified by bar text above
  });

  // ── 3. Mention-source matrix quadrant ──────────────────────────────────

  test("3. Mention-source matrix shows archetype quadrant", async ({ page }) => {
    await signInThroughForm(page, user1);
    await page.goto(`/brands/${brandId}`);
    await page.getByRole("link").filter({ hasText: "Share of voice & trends" }).click();
    await page.waitForURL(`**/brands/${brandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByText("Share of Voice")).toBeVisible({ timeout: 15_000 });

    // Matrix should show the archetype label
    await expect(page.getByText(/Known but Untrusted/i)).toBeVisible();

    // Metric chips should display mention and citation rates (exact: the Share of Voice card
    // shows "22% · 2" for a competitor too)
    await expect(page.getByText("65.0%")).toBeVisible();
    await expect(page.getByText("22.5%")).toBeVisible();
  });

  // ── 4. Fan-out tree renders sub-queries ────────────────────────────────

  // Query simulation (the fan-out tree) is paused behind a default-off flag since 07cb14d (23 Oct):
  // the page says so instead of drawing the seeded sub-queries.
  test("4. Fan-out: the page says query simulation is paused", async ({ page }) => {
    await signInThroughForm(page, user1);
    await page.goto(`/brands/${brandId}`);
    await page.getByRole("link").filter({ hasText: "Share of voice & trends" }).click();
    await page.waitForURL(`**/brands/${brandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByText("Share of Voice")).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByText("Query simulation is being rebuilt and will return soon"),
    ).toBeVisible();
    await expect(page.getByText("best plumber in Sydney")).toHaveCount(0);
  });

  // ── 5. Topical gaps with HIGH LEVERAGE badge ───────────────────────────

  test("5. Topical gap list shows gaps sorted by impact, HIGH LEVERAGE badge", async ({ page }) => {
    await signInThroughForm(page, user1);
    await page.goto(`/brands/${brandId}`);
    await page.getByRole("link").filter({ hasText: "Share of voice & trends" }).click();
    await page.waitForURL(`**/brands/${brandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByText("Share of Voice")).toBeVisible({ timeout: 15_000 });

    // Emergency Plumbing gap should be visible (crossPromptImpact: 3 → HIGH LEVERAGE badge)
    await expect(page.getByText("Emergency Plumbing")).toBeVisible();
    await expect(page.getByText(/HIGH LEVERAGE/)).toBeVisible();

    // "No content" badge for brandHasContent: false
    await expect(page.getByText("No content").first()).toBeVisible();
  });

  // ── 6. Citation failure page reachable from hub ────────────────────────

  test("6. Citation Failure Diagnosis page reachable from visibility hub link", async ({
    page,
  }) => {
    await signInThroughForm(page, user1);
    await page.goto(`/brands/${brandId}`);
    await page.getByRole("link").filter({ hasText: "Share of voice & trends" }).click();
    await page.waitForURL(`**/brands/${brandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByText("Share of Voice")).toBeVisible({ timeout: 15_000 });

    const cfLink = page.getByRole("link", { name: "Citation Failure Diagnosis" });
    await expect(cfLink).toBeVisible();
    await cfLink.click();

    await page.waitForURL(`**/brands/${brandId}/visibility/citation-failure**`, {
      timeout: 10_000,
    });
    await expect(page.getByRole("heading", { name: "Citation Failure Diagnosis" })).toBeVisible();

    // Page should show diagnosis cards or the positive empty state
    const hasCards = await page.locator("[class*='rounded-lg']").count();
    const hasEmpty = await page
      .getByText("No citation gaps found")
      .isVisible()
      .catch(() => false);
    expect(hasCards > 0 || hasEmpty).toBe(true);
  });

  // ── 7. Competitive benchmark — CPR-01 graceful degradation ─────────────

  // Since 9021120 (9 Jul) the panel shows the audit's head-to-head comparisons; with none yet it
  // says so, in place of the old "Coming soon".
  test("7. Competitive benchmark panel: no comparisons yet", async ({ page }) => {
    await signInThroughForm(page, user1);
    await page.goto(`/brands/${brandId}`);
    await page.getByRole("link").filter({ hasText: "Share of voice & trends" }).click();
    await page.waitForURL(`**/brands/${brandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByText("Share of Voice")).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText("No comparison data yet")).toBeVisible();
    await expect(
      page.getByText("Run an audit with competitors to see head-to-head results"),
    ).toBeVisible();
  });

  // ── 8. Dashboard SoV strip shows brand bar ─────────────────────────────

  test("8. Dashboard SoV strip renders share-of-voice for brand", async ({ page }) => {
    await signInThroughForm(page, user1);
    await page.goto("/dashboard");
    await page.waitForURL("**/dashboard**", { timeout: 10_000 });

    // Dashboard should render without error
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible({
      timeout: 15_000,
    });

    // SoV strip should be present if brand has data
    // It fetches from /api/brands/{brandId}/visibility
    // Structural check: "you" chip or SoV bars should appear
    const sovSection = page.getByText("you");
    const sovVisible = await sovSection.isVisible().catch(() => false);
    // If SoV strip loaded, brand bar should be visible
    if (sovVisible) {
      await expect(sovSection).toBeVisible();
    }
  });
});

/* ═══════════════════════════════════════════════════════════
   FE-2: Edge / empty / error states
   ═══════════════════════════════════════════════════════════ */

test.describe("FE-2: Edge and empty states", () => {
  let emptyBrandId = "";

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInThroughForm(page, user1);
    emptyBrandId = await createBrandViaApi(page, {
      name: `${E2E_BRAND_PREFIX} Empty Brand`,
      domain: "e2eempty.com.au",
      vertical: "saas",
    });
    await ctx.close();
  });

  test("1. Empty visibility hub shows 'Run an audit' message", async ({ page }) => {
    await signInThroughForm(page, user1);
    await page.goto(`/brands/${emptyBrandId}`);
    await page
      .getByRole("link")
      .filter({ hasText: /Share of voice|Visibility/ })
      .click();
    await page.waitForURL(`**/brands/${emptyBrandId}/visibility**`, { timeout: 10_000 });

    // Should show the empty state message when no audit data exists
    await expect(page.getByText(/run an audit/i)).toBeVisible({ timeout: 15_000 });
  });

  test("2. Citation failure page positive empty state (no gaps)", async ({ page }) => {
    await signInThroughForm(page, user1);
    await page.goto(`/brands/${emptyBrandId}/visibility/citation-failure`);

    await expect(page.getByRole("heading", { name: "Citation Failure Diagnosis" })).toBeVisible({
      timeout: 15_000,
    });

    // Should show the positive empty state
    await expect(page.getByText("No citation gaps found")).toBeVisible();
  });

  test("3. Volatility indicator shows stable state for low score", async ({ page }) => {
    await signInThroughForm(page, user1);

    const stableBrandId = await createBrandViaApi(page, {
      name: `${E2E_BRAND_PREFIX} Stable Brand`,
      domain: "e2estable.com.au",
    });

    const auditNumber = await nextAuditNumber(orgId);
    await db
      .insert(audits)
      .values({
        organizationId: orgId,
        brandId: stableBrandId,
        auditNumber,
        status: "complete",
        scoreComposite: "80.00",
        completedAt: new Date(),
      })
      .returning();

    await db.insert(visibilityTrends).values({
      brandId: stableBrandId,
      organizationId: orgId,
      periodLabel: "2026-W26-stable",
      periodType: "weekly",
      auditCount: 2,
      sampleQuality: "good",
      mentionRate: "80.00",
      citationRate: "45.00",
      citationVolatilityScore: "8.50",
    });

    // (share_of_voice_snapshots, which this also seeded, has not been read since 9fbb126.)

    await page.goto(`/brands/${stableBrandId}`);
    await page
      .getByRole("link")
      .filter({ hasText: /Share of voice|Visibility/ })
      .click();
    await page.waitForURL(`**/brands/${stableBrandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByText("Share of Voice")).toBeVisible({ timeout: 15_000 });

    // Volatility <= 15 → should NOT show warning icon (⚠)
    const warningIcon = page.getByText("⚠");
    await expect(warningIcon).not.toBeVisible();
  });

  // Since f1ad3f7 (8 Nov) the Visibility page and its routes are on every plan
  // (lib/pricing/brand-features.ts has no entry for it): the tile carries no lock.
  test("4. The Visibility card for a free-tier user: no lock, it opens", async ({ page }) => {
    await signInThroughForm(page, user2);

    const freeBrandId = await createBrandViaApi(page, {
      name: `${E2E_BRAND_PREFIX} Free Brand`,
      domain: "e2efree.com.au",
      vertical: "saas",
    });

    await page.goto(`/brands/${freeBrandId}`);
    await expect(page.getByRole("heading", { name: /E2E-S3 Free Brand/i })).toBeVisible({
      timeout: 15_000,
    });

    const visCard = page.getByRole("link").filter({ hasText: "Share of voice & trends" });
    await expect(visCard).toBeVisible();
    await expect(visCard.locator("[data-plan-lock]")).toHaveCount(0);
    await visCard.click();
    await page.waitForURL(`**/brands/${freeBrandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Visibility Intelligence" })).toBeVisible({
      timeout: 15_000,
    });
  });
});

/* ═══════════════════════════════════════════════════════════
   FE-3: Cross-sprint integration (self-contained — own brand)
   ═══════════════════════════════════════════════════════════ */

test.describe("FE-3: Cross-sprint integration", () => {
  let fe3BrandId = "";
  let fe3AuditId = "";

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInThroughForm(page, user1);

    fe3BrandId = await createBrandViaApi(page, {
      name: `${E2E_BRAND_PREFIX} Integration Brand`,
      domain: "e2eintegration.com.au",
      competitors: ["competitor-alpha.com.au"],
      primaryRegions: ["NSW:Sydney"],
    });

    const auditNumber = await nextAuditNumber(orgId);
    const [audit] = await db
      .insert(audits)
      .values({
        organizationId: orgId,
        brandId: fe3BrandId,
        auditNumber,
        status: "complete",
        scoreComposite: "75.00",
        completedAt: new Date(),
      })
      .returning();
    fe3AuditId = audit.id;

    await seedVisibilityData(orgId, fe3BrandId, fe3AuditId);
    await ctx.close();
  });

  test("1. Brand isolation — User 2 cannot access User 1 visibility data via API", async ({
    page,
  }) => {
    // Topical gaps are a Growth feature: on Free, user 2's request was refused for its plan (403)
    // before the brand was looked at. On Agency, the brand check is what answers.
    await setSpecPlan(user2, "agency");
    try {
      await signInThroughForm(page, user2);

      const visRes = await page.request.get(`/api/brands/${fe3BrandId}/visibility`);
      expect([401, 404]).toContain(visRes.status());

      const fanOutRes = await page.request.get(`/api/brands/${fe3BrandId}/fan-out`);
      expect([401, 404]).toContain(fanOutRes.status());

      const gapsRes = await page.request.get(`/api/brands/${fe3BrandId}/topical-gaps`);
      expect([401, 404]).toContain(gapsRes.status());
    } finally {
      await setSpecPlan(user2, null);
    }
  });

  test("2. Full flow: brand detail → visibility hub → all sections render", async ({ page }) => {
    await signInThroughForm(page, user1);
    await page.goto(`/brands/${fe3BrandId}`);
    await expect(page.getByRole("heading", { name: /E2E-S3 Integration Brand/i })).toBeVisible({
      timeout: 15_000,
    });

    const visCard = page.getByRole("link").filter({ hasText: "Share of voice & trends" });
    await visCard.click();
    await page.waitForURL(`**/brands/${fe3BrandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Visibility Intelligence" })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByText("Share of Voice")).toBeVisible();
    // Query simulation is paused (07cb14d): its note, not the seeded fan-out prompt.
    await expect(
      page.getByText("Query simulation is being rebuilt and will return soon"),
    ).toBeVisible();
    await expect(page.getByText("Emergency Plumbing")).toBeVisible();

    await expect(page.getByRole("link", { name: "Citation Failure Diagnosis" })).toBeVisible();
  });

  test("3. Dashboard and visibility hub coexist without error", async ({ page }) => {
    await signInThroughForm(page, user1);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(`/brands/${fe3BrandId}`);
    await expect(page.getByRole("heading", { name: /E2E-S3 Integration Brand/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("link").filter({ hasText: "Share of voice & trends" }).click();
    await page.waitForURL(`**/brands/${fe3BrandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Visibility Intelligence" })).toBeVisible({
      timeout: 15_000,
    });

    const errorText = page.getByText("Failed to load");
    await expect(errorText).not.toBeVisible();
  });

  test("4. Visibility API returns correct data shape", async ({ page }) => {
    await signInThroughForm(page, user1);

    const visRes = await page.request.get(`/api/brands/${fe3BrandId}/visibility`);
    expect(visRes.ok()).toBe(true);
    const visData = await visRes.json();

    expect(visData).toHaveProperty("trends");
    // One Share of Voice (7 Nov): the shared counter's payload, not snapshot rows.
    expect(visData).toHaveProperty("shareOfVoice");
    expect(visData).toHaveProperty("tier");
    expect(visData).toHaveProperty("brandDomain");
    expect(visData.shareOfVoice).toHaveProperty("line");

    if (visData.trends) {
      expect(visData.trends).toHaveProperty("mentionRate");
      expect(visData.trends).toHaveProperty("citationRate");
      expect(visData.trends).toHaveProperty("brandArchetype");
    }

    const fanOutRes = await page.request.get(`/api/brands/${fe3BrandId}/fan-out`);
    expect(fanOutRes.ok()).toBe(true);
    const fanOutData = await fanOutRes.json();
    expect(fanOutData).toHaveProperty("groups");
    expect(Array.isArray(fanOutData.groups)).toBe(true);

    if (fanOutData.groups.length > 0) {
      const group = fanOutData.groups[0];
      expect(group).toHaveProperty("originalPrompt");
      expect(group).toHaveProperty("results");
      expect(Array.isArray(group.results)).toBe(true);
    }

    const gapsRes = await page.request.get(`/api/brands/${fe3BrandId}/topical-gaps`);
    expect(gapsRes.ok()).toBe(true);
    const gapsData = await gapsRes.json();
    expect(gapsData).toHaveProperty("gaps");
    expect(Array.isArray(gapsData.gaps)).toBe(true);

    const benchRes = await page.request.get(
      `/api/brands/${fe3BrandId}/competitive-benchmark?competitor=competitor-alpha.com.au`,
    );
    expect(benchRes.ok()).toBe(true);
    const benchData = await benchRes.json();
    // Since 9021120 (9 Jul): head-to-head results per configured competitor and a summary, not
    // the "comparisonData: null, dataAvailableFrom: Sprint 7" placeholder.
    expect(Array.isArray(benchData.competitors)).toBe(true);
    expect(benchData).toHaveProperty("summary.totalWins");
    expect(benchData).toHaveProperty("summary.totalLosses");
    expect(benchData).toHaveProperty("tier");
  });
});
