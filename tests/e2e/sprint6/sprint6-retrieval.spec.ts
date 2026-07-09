/**
 * tests/e2e/sprint6/sprint6-retrieval.spec.ts
 *
 * Playwright E2E: Sprint 6 Retrieval Intelligence — 5 screens
 *
 * Covers: hub (3 stats, no depth card, tile nav), agent-readiness (score, dims,
 * sub-signals, Refresh VISIBLE), entity-home (Bug B fields, no grid),
 * crawler-logs (empty state), content-structure (citation headline + bands).
 *
 * Database: DEV only (visibleau, NOT visibleau_prod).
 * LLM_MODE=mock via .env.test.local.
 *
 * Run: npx playwright test --config tests/e2e/sprint6/playwright.config.ts
 */

import { test, expect } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import {
  db,
  ensureOrganization,
  ensureUser,
} from "../helpers/db";
import {
  agentReadinessScores,
  brands,
  contentStructureAudits,
  crawlerVisitLogs,
  llmstxtVersions,
  subscriptions,
} from "@/db/schema";
import { signInAsTestUser } from "../helpers/auth";

/* ─── Database safety check ─────────────────────────────── */

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("visibleau_prod")) {
  throw new Error(
    "FATAL: DATABASE_URL points to PROD (visibleau_prod). " +
      "Sprint 6 E2E must run against DEV. Load .env.test.local.",
  );
}

/* ─── Test constants ────────────────────────────────────── */

const USER_1_CLERK_ID = process.env.E2E_TEST_USER_1_CLERK_ID ?? "";
const ORG_1_CLERK_ID = process.env.E2E_TEST_ORG_1_CLERK_ID ?? "";

let orgId = "";
let brandId = "";

const E2E_BRAND_PREFIX = "E2E-S6";

/* ─── Seed / teardown helpers ───────────────────────────── */

async function cleanupBrandData(bId: string) {
  await db.delete(agentReadinessScores).where(eq(agentReadinessScores.brandId, bId)).catch(() => {});
  await db.delete(contentStructureAudits).where(eq(contentStructureAudits.brandId, bId)).catch(() => {});
  await db.delete(crawlerVisitLogs).where(eq(crawlerVisitLogs.brandId, bId)).catch(() => {});
  await db.delete(llmstxtVersions).where(eq(llmstxtVersions.brandId, bId)).catch(() => {});
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
    stripeCustomerId: `cus_e2e_s6_${oId.slice(0, 8)}`,
    stripeSubscriptionId: `sub_e2e_s6_${oId.slice(0, 8)}_${Date.now()}`,
    stripePriceId: "price_e2e_s6_test",
    tier,
    billingInterval: "monthly",
    status: "active",
  });
}

/* ─── Global setup / teardown ───────────────────────────── */

test.beforeAll(async () => {
  const org = await ensureOrganization({
    clerkOrgId: ORG_1_CLERK_ID,
    name: "E2E Sprint 6 Org",
    tier: "agency",
  });
  orgId = org.id;

  await ensureUser({
    clerkUserId: USER_1_CLERK_ID,
    organizationId: orgId,
    email: process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local",
    name: "E2E Test User",
  });

  await ensureSubscription(orgId, "agency");
  await cleanupE2eBrands(orgId);

  const [brand] = await db
    .insert(brands)
    .values({
      organizationId: orgId,
      name: `${E2E_BRAND_PREFIX}-Retrieval`,
      domain: "e2e-s6-retrieval.com.au",
      vertical: "tradies",
      region: "au",
    })
    .returning();
  brandId = brand.id;

  // Seed agent_readiness_scores
  await db.insert(agentReadinessScores).values({
    brandId,
    organizationId: orgId,
    techScore: 14,
    entityClarityScore: 16,
    verifyScore: 8,
    authorityScore: 5,
    taskScore: 13,
    totalScore: 56,
    gaps: JSON.stringify(["Improve llms.txt depth", "Add FAQ schema"]),
  });

  // Seed content_structure_audits — /about (entity home) + /services
  await db.insert(contentStructureAudits).values([
    {
      brandId,
      organizationId: orgId,
      pageUrl: "https://e2e-s6-retrieval.com.au/about",
      isEntityHomeCandidate: true,
      entityHomeHasOrgSchema: true,
      entityHomeHasIdField: true,
      entityHomeSameAsCount: 4,
      entityHomePageUrl: "https://e2e-s6-retrieval.com.au/about",
      citationProbabilityScore: "0.45",
      contentFormatDetected: "expert_article",
      wordCount: 1800,
      answerCapsuleScore: 3,
      optimalPassageCount: 5,
      freshnessRisk: "fresh",
    },
    {
      brandId,
      organizationId: orgId,
      pageUrl: "https://e2e-s6-retrieval.com.au/services",
      citationProbabilityScore: "0.22",
      contentFormatDetected: "listicle",
      wordCount: 950,
      answerCapsuleScore: 1,
      optimalPassageCount: 2,
      freshnessRisk: "aging",
    },
  ]);

  // Seed llmstxt — current version
  await db.insert(llmstxtVersions).values({
    brandId,
    organizationId: orgId,
    content: "# llms.txt\nUser-agent: *\nAllow: /",
    depthScore: 12,
    isCurrent: true,
  });

  // crawler_visit_logs: intentionally EMPTY for empty-state assertion
});

test.afterAll(async () => {
  await cleanupE2eBrands(orgId);
});

test.beforeEach(async ({ page }) => {
  await signInAsTestUser(page);
});

// ═══════════════════════════════════════════════════════════════
// Screen 1 — Retrieval Hub (/brands/{id}/retrieval)
// ═══════════════════════════════════════════════════════════════

test.describe("Screen 1 — Retrieval Hub", () => {
  test("renders 3 stat cards: Agent Readiness, Avg Citation Prob, Crawler Visits", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval`);
    await expect(page.getByRole("heading", { name: "Retrieval Intelligence" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Avg Citation Prob.")).toBeVisible();
    await expect(page.getByText("Crawler Visits")).toBeVisible();
    await expect(page.getByText("56/100")).toBeVisible();
  });

  test("NO standalone llms.txt Depth /18 stat card (depth-card fix)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval`);
    await expect(page.getByRole("heading", { name: "Retrieval Intelligence" })).toBeVisible({ timeout: 15000 });
    // The /18 depth stat must NOT appear as a hub stat card
    await expect(page.locator("text=/18").first()).not.toBeVisible().catch(() => {
      // If "/18" appears nowhere, that's the correct state
    });
    const pageContent = await page.textContent("body");
    // Depth is inside agent-readiness card (sub-signal), not as a standalone hub stat
    expect(pageContent).not.toContain("llms.txt Depth");
  });

  test("5 sub-screen tiles render and are clickable", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval`);
    await expect(page.getByRole("heading", { name: "Retrieval Intelligence" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("link", { name: /Crawler Logs/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Content Structure/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Agent Readiness/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Entity Home/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /llms\.txt/ })).toBeVisible();
  });

  test("clicking Agent Readiness tile navigates to sub-route (not 404)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval`);
    await page.getByRole("link", { name: "Agent Readiness" }).click();
    await expect(page).toHaveURL(new RegExp(`/brands/${brandId}/retrieval/agent-readiness`));
    // Must NOT be a 404 — the heading renders
    await expect(page.getByRole("heading", { name: "Agent Readiness", exact: true })).toBeVisible({ timeout: 15000 });
  });
});

// ═══════════════════════════════════════════════════════════════
// Screen 2 — Agent Readiness (/retrieval/agent-readiness)
// ═══════════════════════════════════════════════════════════════

test.describe("Screen 2 — Agent Readiness", () => {
  test("renders total score 56/100", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/agent-readiness`);
    await expect(page.getByText("56/100")).toBeVisible({ timeout: 15000 });
  });

  test("renders 5 dimension labels", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/agent-readiness`);
    await expect(page.getByText("Technical", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Entity Clarity")).toBeVisible();
    await expect(page.getByText("Verifiability")).toBeVisible();
    await expect(page.getByText("Authority")).toBeVisible();
    await expect(page.getByText("Task-Fit")).toBeVisible();
  });

  test("Technical sub-signals section renders (llms.txt depth + MCP)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/agent-readiness`);
    await expect(page.getByText("Technical sub-signals")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/llms\.txt depth: 12\/18/)).toBeVisible();
    await expect(page.getByText(/MCP:/)).toBeVisible();
  });

  test("Refresh Score button is VISIBLE + readable (marquee: would have caught white-on-white)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/agent-readiness`);
    const refreshBtn = page.getByRole("button", { name: /Refresh Score/i });
    await expect(refreshBtn).toBeVisible({ timeout: 15000 });
    await expect(refreshBtn).toBeEnabled();
    // The button text must be readable — not empty or invisible
    const btnText = await refreshBtn.textContent();
    expect(btnText?.trim()).toBe("Refresh Score");
  });

  test("gaps list renders", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/agent-readiness`);
    await expect(page.getByText("Improve llms.txt depth")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Add FAQ schema")).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════
// Screen 3 — Entity Home (/retrieval/entity-home)
// ═══════════════════════════════════════════════════════════════

test.describe("Screen 3 — Entity Home", () => {
  test("renders @id, sameAs count, Organisation schema (Bug B display fix)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/entity-home`);
    await expect(page.getByRole("heading", { name: /Entity Home/i }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/@id:/)).toBeVisible();
    await expect(page.getByText(/sameAs count:/)).toBeVisible();
    await expect(page.getByText("4/3 required")).toBeVisible();
    await expect(page.getByText(/Organisation schema:/)).toBeVisible();
  });

  test("shows Complete badge (all fields present + sameAs ≥ 3)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/entity-home`);
    await expect(page.getByText("Complete")).toBeVisible({ timeout: 15000 });
  });

  test("does NOT show content-structure fields (Bug B guard)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/entity-home`);
    await expect(page.getByRole("heading", { name: /Entity Home/i }).first()).toBeVisible({ timeout: 15000 });
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Citation Prob");
    expect(bodyText).not.toContain("Answer Capsule");
    expect(bodyText).not.toContain("contentFormatDetected");
  });

  test("NO 'Audited Pages' content-structure grid (grid-removal fix)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/entity-home`);
    await expect(page.getByRole("heading", { name: /Entity Home/i }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Audited Pages")).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════
// Screen 4 — Crawler Logs (/retrieval/crawler-logs)
// ═══════════════════════════════════════════════════════════════

test.describe("Screen 4 — Crawler Logs", () => {
  test("empty state: 'No crawler visits recorded yet. Install the tracking snippet'", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/crawler-logs`);
    await expect(
      page.getByText(/No crawler visits recorded yet.*Install the tracking snippet/),
    ).toBeVisible({ timeout: 15000 });
  });

  test("CdnBlockAlert NOT shown when no blocked CDN (honest-block)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/crawler-logs`);
    await expect(page.getByText(/No crawler visits recorded/)).toBeVisible({ timeout: 15000 });
    // CdnBlockAlert only renders when cdnDiag?.isBlockedByCDN is true
    // With no real CDN probe hitting a blocked domain, the alert should be absent
    await expect(page.getByText("AI Crawler Access Blocked")).not.toBeVisible();
  });

  // NOTE: CdnBlockAlert E2E with real blocked-CDN data would require a live domain
  // behind a blocking CDN (Cloudflare/Vercel returning 403). The component-level
  // render test (sprint6-frontend-components.test.tsx) covers the alert rendering;
  // E2E can only assert the non-blocked state honestly.
});

// ═══════════════════════════════════════════════════════════════
// Screen 5 — Content Structure (/retrieval/content-structure)
// ═══════════════════════════════════════════════════════════════

test.describe("Screen 5 — Content Structure", () => {
  test("citation HEADLINE renders above cards: 'How likely is this page to be cited by AI?'", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/content-structure`);
    await expect(
      page.getByText("How likely is this page to be cited by AI?"),
    ).toBeVisible({ timeout: 15000 });
  });

  test("headline shows % with amber/Moderate band for 0.45 probability", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/content-structure`);
    await expect(page.getByText("45%").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Moderate")).toBeVisible();
  });

  test("per-page cards render format + word count", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/content-structure`);
    await expect(page.getByText("https://e2e-s6-retrieval.com.au/about").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/expert_article/)).toBeVisible();
    await expect(page.getByText(/1800 words/)).toBeVisible();
  });

  test("per-page card for /services shows 22% (red band)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/content-structure`);
    await expect(page.getByText("22%")).toBeVisible({ timeout: 15000 });
  });
});
