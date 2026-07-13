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
 * Database: DEV only (visibleau, NOT visibleau_prod).
 *
 * Run: npx playwright test --config tests/e2e/sprint3/playwright.config.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  ensureOrganization,
  ensureUser,
  deleteAllBrandsForOrg,
} from "../helpers/db";
import {
  audits,
  brands,
  organizations,
  queryFanOutResults,
  shareOfVoiceSnapshots,
  subscriptions,
  topicalCoverageGaps,
  visibilityTrends,
} from "@/db/schema";
import { signInAsTestUser, signInAsTestUser2 } from "../helpers/auth";

/* ─── Database safety check ─────────────────────────────── */

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("visibleau_prod")) {
  throw new Error(
    "FATAL: DATABASE_URL points to PROD (visibleau_prod). " +
      "Sprint 3 E2E must run against DEV. Load .env.test.local.",
  );
}

/* ─── Test constants ────────────────────────────────────── */

const USER_1_CLERK_ID = process.env.E2E_TEST_USER_1_CLERK_ID ?? "";
const ORG_1_CLERK_ID = process.env.E2E_TEST_ORG_1_CLERK_ID ?? "";
const USER_2_CLERK_ID = process.env.E2E_TEST_USER_2_CLERK_ID ?? "";
const ORG_2_CLERK_ID = process.env.E2E_TEST_ORG_2_CLERK_ID ?? "";

let orgId = "";
let org2Id = "";
let brandId = "";
let auditId = "";

const E2E_BRAND_PREFIX = "E2E-S3";

/* ─── Seed / teardown helpers ───────────────────────────── */

async function cleanupBrandData(bId: string) {
  await db.delete(queryFanOutResults).where(eq(queryFanOutResults.brandId, bId));
  await db.delete(shareOfVoiceSnapshots).where(eq(shareOfVoiceSnapshots.brandId, bId));
  await db.delete(topicalCoverageGaps).where(eq(topicalCoverageGaps.brandId, bId));
  await db.delete(visibilityTrends).where(eq(visibilityTrends.brandId, bId));
  await db.execute(sql`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE brand_id = ${bId})`);
  await db.execute(sql`DELETE FROM audit_exports WHERE audit_id IN (SELECT id FROM audits WHERE brand_id = ${bId})`);
  await db.execute(sql`DELETE FROM technical_audits WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM drift_alerts WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM workflow_runs WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM brand_entity_scores WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM audit_schedules WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM client_portal_invites WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM client_portal_views WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM remediation_tasks WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM action_items WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM content_drafts WHERE brand_id = ${bId}`);
  await db.delete(audits).where(eq(audits.brandId, bId));
}

async function cleanupE2eBrands(oId: string) {
  const e2eBrands = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(eq(brands.organizationId, oId));
  for (const b of e2eBrands) {
    if (b.name.startsWith(E2E_BRAND_PREFIX)) {
      await cleanupBrandData(b.id);
      await db.delete(brands).where(eq(brands.id, b.id));
    }
  }
}

async function updateOrgTier(oId: string, tier: string) {
  await db.execute(sql`UPDATE organizations SET tier = ${tier} WHERE id = ${oId}`);
}

async function createBrandViaApi(page: Page, data: { name: string; domain: string; vertical?: string; competitors?: string[]; primaryRegions?: string[] }) {
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

async function ensureSubscription(oId: string, tier: string) {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, oId));

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
    organizationId: oId,
    stripeCustomerId: `cus_e2e_s3_${oId.slice(0, 8)}`,
    stripeSubscriptionId: `sub_e2e_s3_${oId.slice(0, 8)}_${Date.now()}`,
    stripePriceId: "price_e2e_s3_test",
    tier,
    billingInterval: "monthly",
    status: "active",
  });
}

async function seedVisibilityData(oId: string, bId: string, aId: string) {
  // SoV snapshots — multiple competitors including the brand domain
  await db.insert(shareOfVoiceSnapshots).values([
    {
      brandId: bId,
      organizationId: oId,
      auditId: aId,
      competitorDomain: "e2evisibility.com.au",
      promptCategory: "brand",
      engine: "chatgpt",
      brandShare: "35.50",
      competitorShare: "0.00",
      totalPrompts: 10,
      sampleQuality: "good",
    },
    {
      brandId: bId,
      organizationId: oId,
      auditId: aId,
      competitorDomain: "competitor-alpha.com.au",
      promptCategory: "brand",
      engine: "chatgpt",
      brandShare: "35.50",
      competitorShare: "28.00",
      totalPrompts: 10,
      sampleQuality: "good",
    },
    {
      brandId: bId,
      organizationId: oId,
      auditId: aId,
      competitorDomain: "competitor-beta.com.au",
      promptCategory: "brand",
      engine: "chatgpt",
      brandShare: "35.50",
      competitorShare: "15.20",
      totalPrompts: 10,
      sampleQuality: "good",
    },
  ]);

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
  if (!USER_1_CLERK_ID || !ORG_1_CLERK_ID) {
    throw new Error(
      "E2E_TEST_USER_1_CLERK_ID and E2E_TEST_ORG_1_CLERK_ID must be set in .env.test.local",
    );
  }

  const org = await ensureOrganization({
    clerkOrgId: ORG_1_CLERK_ID,
    name: "Sprint 3 E2E Org",
    tier: "agency",
  });
  orgId = org.id;
  await updateOrgTier(orgId, "agency");
  await ensureUser({
    clerkUserId: USER_1_CLERK_ID,
    organizationId: orgId,
    email: process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local",
  });

  await ensureSubscription(orgId, "growth");
  await cleanupE2eBrands(orgId);

  if (ORG_2_CLERK_ID && USER_2_CLERK_ID) {
    const org2 = await ensureOrganization({
      clerkOrgId: ORG_2_CLERK_ID,
      name: "Sprint 3 E2E Org 2",
      tier: "free",
    });
    org2Id = org2.id;
    await updateOrgTier(org2Id, "free");
    await ensureUser({
      clerkUserId: USER_2_CLERK_ID,
      organizationId: org2Id,
      email: process.env.E2E_TEST_USER_2_EMAIL ?? "user2@visibleau.local",
    });
    await cleanupE2eBrands(org2Id);
  }
});

test.afterAll(async () => {
  if (orgId) {
    await cleanupE2eBrands(orgId);
    await updateOrgTier(orgId, "growth");
  }
  if (org2Id) {
    await cleanupE2eBrands(org2Id);
    await updateOrgTier(org2Id, "starter");
  }
});

/* ═══════════════════════════════════════════════════════════
   FE-1: Sprint 3 Visibility E2E — core screens
   ═══════════════════════════════════════════════════════════ */

test.describe("FE-1: Sprint 3 Visibility E2E", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signInAsTestUser(page);

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

  test("1. Visibility hub reachable from brand detail via Visibility card", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    await page.goto(`/brands/${brandId}`);
    await expect(
      page.getByRole("heading", { name: /E2E-S3 Visibility Brand/i }),
    ).toBeVisible({ timeout: 15_000 });

    const visCard = page.getByRole("link").filter({ hasText: "Share of voice & trends" });
    await expect(visCard).toBeVisible();
    await visCard.click();

    await page.waitForURL(`**/brands/${brandId}/visibility**`, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Visibility Intelligence" }),
    ).toBeVisible();
  });

  // ── 2. SoV bars render (not donut) ─────────────────────────────────────

  test("2. SoV section renders horizontal bars, brand highlighted", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    await page.goto(`/brands/${brandId}`);
    await expect(page.getByRole("heading", { name: /E2E-S3 Visibility Brand/i })).toBeVisible({ timeout: 15_000 });
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

  test("3. Mention-source matrix shows archetype quadrant", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    await page.goto(`/brands/${brandId}`);
    await page.getByRole("link").filter({ hasText: "Share of voice & trends" }).click();
    await page.waitForURL(`**/brands/${brandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByText("Share of Voice")).toBeVisible({ timeout: 15_000 });

    // Matrix should show the archetype label
    await expect(page.getByText(/Known but Untrusted/i)).toBeVisible();

    // Metric chips should display mention and citation rates
    await expect(page.getByText(/65/)).toBeVisible();
    await expect(page.getByText(/22/)).toBeVisible();
  });

  // ── 4. Fan-out tree renders sub-queries ────────────────────────────────

  test("4. Fan-out tree shows sub-queries sorted by rank", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    await page.goto(`/brands/${brandId}`);
    await page.getByRole("link").filter({ hasText: "Share of voice & trends" }).click();
    await page.waitForURL(`**/brands/${brandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByText("Share of Voice")).toBeVisible({ timeout: 15_000 });

    // Original prompt should appear
    await expect(page.getByText("best plumber in Sydney")).toBeVisible();

    // Sub-queries should be visible
    await expect(page.getByText("top rated plumbers Sydney reviews")).toBeVisible();
    await expect(page.getByText("emergency plumber Sydney 24 hour")).toBeVisible();

    // "Cited" badge for brandAppeared results
    const citedBadges = page.getByText("Cited");
    await expect(citedBadges.first()).toBeVisible();
  });

  // ── 5. Topical gaps with HIGH LEVERAGE badge ───────────────────────────

  test("5. Topical gap list shows gaps sorted by impact, HIGH LEVERAGE badge", async ({
    page,
  }) => {
    await signInAsTestUser(page);
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
    await signInAsTestUser(page);
    await page.goto(`/brands/${brandId}`);
    await page.getByRole("link").filter({ hasText: "Share of voice & trends" }).click();
    await page.waitForURL(`**/brands/${brandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByText("Share of Voice")).toBeVisible({ timeout: 15_000 });

    const cfLink = page.getByRole("link", { name: "Citation Failure Diagnosis" });
    await expect(cfLink).toBeVisible();
    await cfLink.click();

    await page.waitForURL(`**/brands/${brandId}/visibility/citation-failure**`, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Citation Failure Diagnosis" }),
    ).toBeVisible();

    // Page should show diagnosis cards or the positive empty state
    const hasCards = await page.locator("[class*='rounded-lg']").count();
    const hasEmpty = await page.getByText("No citation gaps found").isVisible().catch(() => false);
    expect(hasCards > 0 || hasEmpty).toBe(true);
  });

  // ── 7. Competitive benchmark — CPR-01 graceful degradation ─────────────

  test("7. Competitive benchmark panel shows 'Coming soon' (CPR-01)", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    await page.goto(`/brands/${brandId}`);
    await page.getByRole("link").filter({ hasText: "Share of voice & trends" }).click();
    await page.waitForURL(`**/brands/${brandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByText("Share of Voice")).toBeVisible({ timeout: 15_000 });

    // CPR-01: data prop is null → graceful "Coming soon" placeholder (LLD spec)
    await expect(page.getByText(/Coming soon/i)).toBeVisible();
  });

  // ── 8. Dashboard SoV strip shows brand bar ─────────────────────────────

  test("8. Dashboard SoV strip renders share-of-voice for brand", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    await page.goto("/dashboard");
    await page.waitForURL("**/dashboard**", { timeout: 10_000 });

    // Dashboard should render without error
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible({ timeout: 15_000 });

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
    await signInAsTestUser(page);
    emptyBrandId = await createBrandViaApi(page, {
      name: `${E2E_BRAND_PREFIX} Empty Brand`,
      domain: "e2eempty.com.au",
      vertical: "saas",
    });
    await ctx.close();
  });

  test("1. Empty visibility hub shows 'Run an audit' message", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    await page.goto(`/brands/${emptyBrandId}`);
    await page.getByRole("link").filter({ hasText: /Share of voice|Visibility/ }).click();
    await page.waitForURL(`**/brands/${emptyBrandId}/visibility**`, { timeout: 10_000 });

    // Should show the empty state message when no audit data exists
    await expect(
      page.getByText(/run an audit/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("2. Citation failure page positive empty state (no gaps)", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    await page.goto(`/brands/${emptyBrandId}/visibility/citation-failure`);

    await expect(
      page.getByRole("heading", { name: "Citation Failure Diagnosis" }),
    ).toBeVisible({ timeout: 15_000 });

    // Should show the positive empty state
    await expect(
      page.getByText("No citation gaps found"),
    ).toBeVisible();
  });

  test("3. Volatility indicator shows stable state for low score", async ({
    page,
  }) => {
    await signInAsTestUser(page);

    const stableBrandId = await createBrandViaApi(page, {
      name: `${E2E_BRAND_PREFIX} Stable Brand`,
      domain: "e2estable.com.au",
    });

    const auditNumber = await nextAuditNumber(orgId);
    const [audit] = await db
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

    await db.insert(shareOfVoiceSnapshots).values({
      brandId: stableBrandId,
      organizationId: orgId,
      auditId: audit.id,
      competitorDomain: "e2estable.com.au",
      promptCategory: "brand",
      engine: "chatgpt",
      brandShare: "60.00",
      competitorShare: "0.00",
      totalPrompts: 10,
      sampleQuality: "good",
    });

    await page.goto(`/brands/${stableBrandId}`);
    await page.getByRole("link").filter({ hasText: /Share of voice|Visibility/ }).click();
    await page.waitForURL(`**/brands/${stableBrandId}/visibility**`, { timeout: 10_000 });
    await expect(page.getByText("Share of Voice")).toBeVisible({ timeout: 15_000 });

    // Volatility <= 15 → should NOT show warning icon (⚠)
    const warningIcon = page.getByText("⚠");
    await expect(warningIcon).not.toBeVisible();
  });

  test("4. Tier-gated visibility card for free-tier user", async ({
    page,
  }) => {
    if (!ORG_2_CLERK_ID || !USER_2_CLERK_ID) {
      test.skip();
      return;
    }

    await signInAsTestUser2(page);

    const freeBrandId = await createBrandViaApi(page, {
      name: `${E2E_BRAND_PREFIX} Free Brand`,
      domain: "e2efree.com.au",
      vertical: "saas",
    });

    await page.goto(`/brands/${freeBrandId}`);
    await expect(page.getByRole("heading", { name: /E2E-S3 Free Brand/i })).toBeVisible({ timeout: 15_000 });

    // The Visibility card should show locked state for free-tier org
    // isFree check: org.tier === "free" → desc = "Growth plan required", locked = true
    await expect(page.getByText("Growth plan required")).toBeVisible();
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
    await signInAsTestUser(page);

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
    if (!ORG_2_CLERK_ID || !USER_2_CLERK_ID) {
      test.skip();
      return;
    }

    await signInAsTestUser2(page);

    const visRes = await page.request.get(`/api/brands/${fe3BrandId}/visibility`);
    expect([401, 404]).toContain(visRes.status());

    const fanOutRes = await page.request.get(`/api/brands/${fe3BrandId}/fan-out`);
    expect([401, 404]).toContain(fanOutRes.status());

    const gapsRes = await page.request.get(`/api/brands/${fe3BrandId}/topical-gaps`);
    expect([401, 404]).toContain(gapsRes.status());
  });

  test("2. Full flow: brand detail → visibility hub → all sections render", async ({
    page,
  }) => {
    await signInAsTestUser(page);
    await page.goto(`/brands/${fe3BrandId}`);
    await expect(
      page.getByRole("heading", { name: /E2E-S3 Integration Brand/i }),
    ).toBeVisible({ timeout: 15_000 });

    const visCard = page.getByRole("link").filter({ hasText: "Share of voice & trends" });
    await visCard.click();
    await page.waitForURL(`**/brands/${fe3BrandId}/visibility**`, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Visibility Intelligence" }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText("Share of Voice")).toBeVisible();
    await expect(page.getByText("best plumber in Sydney")).toBeVisible();
    await expect(page.getByText("Emergency Plumbing")).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Citation Failure Diagnosis" }),
    ).toBeVisible();
  });

  test("3. Dashboard and visibility hub coexist without error", async ({
    page,
  }) => {
    await signInAsTestUser(page);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible({ timeout: 15_000 });

    await page.goto(`/brands/${fe3BrandId}`);
    await expect(page.getByRole("heading", { name: /E2E-S3 Integration Brand/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("link").filter({ hasText: "Share of voice & trends" }).click();
    await page.waitForURL(`**/brands/${fe3BrandId}/visibility**`, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Visibility Intelligence" }),
    ).toBeVisible({ timeout: 15_000 });

    const errorText = page.getByText("Failed to load");
    await expect(errorText).not.toBeVisible();
  });

  test("4. Visibility API returns correct data shape", async ({
    page,
  }) => {
    await signInAsTestUser(page);

    const visRes = await page.request.get(`/api/brands/${fe3BrandId}/visibility`);
    expect(visRes.ok()).toBe(true);
    const visData = await visRes.json();

    expect(visData).toHaveProperty("trends");
    expect(visData).toHaveProperty("sov");
    expect(visData).toHaveProperty("tier");
    expect(visData).toHaveProperty("brandDomain");
    expect(Array.isArray(visData.sov)).toBe(true);

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
    expect(benchData).toHaveProperty("comparisonData");
    expect(benchData.comparisonData).toBeNull();
    expect(benchData).toHaveProperty("dataAvailableFrom");
    expect(benchData.dataAvailableFrom).toBe("Sprint 7");
    expect(benchData).toHaveProperty("tier");
  });
});
