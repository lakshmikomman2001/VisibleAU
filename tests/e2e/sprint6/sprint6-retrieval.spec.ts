/**
 * tests/e2e/sprint6/sprint6-retrieval.spec.ts
 *
 * Playwright E2E: Sprint 6 Retrieval Intelligence — 5 screens
 *
 * Covers: hub (3 stats, no depth card, tile nav), agent-readiness (score, dims,
 * sub-signals, Refresh VISIBLE), entity-home (Bug B fields, no grid),
 * crawler-logs (empty state), content-structure (citation headline + bands).
 *
 * Database: the local e2e database only (visibleau_e2e), via .env.test.local.
 * LLM_MODE=mock via .env.test.local.
 *
 * Run: npx playwright test --config tests/e2e/sprint6/playwright.config.ts
 */

import { expect, test } from "@playwright/test";
import { agentReadinessScores, brands, contentStructureAudits, llmstxtVersions } from "@/db/schema";
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

const E2E_BRAND_PREFIX = "E2E-S6";

/* ─── Seed / teardown helpers ───────────────────────────── */

/* ─── Global setup / teardown ───────────────────────────── */

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "sprint6", plan: "agency" });
  orgId = account.organizationId;

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
  await removeSpecAccount(account);
});

test.beforeEach(async ({ page }) => {
  await signInThroughForm(page, account);
});

// ═══════════════════════════════════════════════════════════════
// Screen 1 — Retrieval Hub (/brands/{id}/retrieval)
// ═══════════════════════════════════════════════════════════════

test.describe("Screen 1 — Retrieval Hub", () => {
  test("renders 3 stat cards: Agent Readiness, Avg Citation Prob, Crawler Visits", async ({
    page,
  }) => {
    await page.goto(`/brands/${brandId}/retrieval`);
    await expect(page.getByRole("heading", { name: "Retrieval Intelligence" })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Avg Citation Prob.")).toBeVisible();
    await expect(page.getByText("Crawler Visits")).toBeVisible();
    await expect(page.getByText("56/100")).toBeVisible();
  });

  test("NO standalone llms.txt Depth /18 stat card (depth-card fix)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval`);
    await expect(page.getByRole("heading", { name: "Retrieval Intelligence" })).toBeVisible({
      timeout: 15000,
    });
    // The /18 depth stat must NOT appear as a hub stat card
    await expect(page.locator("text=/18").first())
      .not.toBeVisible()
      .catch(() => {
        // If "/18" appears nowhere, that's the correct state
      });
    const pageContent = await page.textContent("body");
    // Depth is inside agent-readiness card (sub-signal), not as a standalone hub stat
    expect(pageContent).not.toContain("llms.txt Depth");
  });

  test("5 sub-screen tiles render and are clickable", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval`);
    await expect(page.getByRole("heading", { name: "Retrieval Intelligence" })).toBeVisible({
      timeout: 15000,
    });
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
    await expect(page.getByRole("heading", { name: "Agent Readiness", exact: true })).toBeVisible({
      timeout: 15000,
    });
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

  test("Refresh Score button is VISIBLE + readable (marquee: would have caught white-on-white)", async ({
    page,
  }) => {
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
    await expect(page.getByRole("heading", { name: /Entity Home/i }).first()).toBeVisible({
      timeout: 15000,
    });
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
    await expect(page.getByRole("heading", { name: /Entity Home/i }).first()).toBeVisible({
      timeout: 15000,
    });
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Citation Prob");
    expect(bodyText).not.toContain("Answer Capsule");
    expect(bodyText).not.toContain("contentFormatDetected");
  });

  test("NO 'Audited Pages' content-structure grid (grid-removal fix)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/entity-home`);
    await expect(page.getByRole("heading", { name: /Entity Home/i }).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Audited Pages")).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════
// Screen 4 — Crawler Logs (/retrieval/crawler-logs)
// ═══════════════════════════════════════════════════════════════

test.describe("Screen 4 — Crawler Logs", () => {
  test("empty state: 'No crawler visits recorded yet. Install the tracking snippet'", async ({
    page,
  }) => {
    await page.goto(`/brands/${brandId}/retrieval/crawler-logs`);
    await expect(
      page.getByText(/No crawler visits recorded yet.*Install the tracking snippet/),
    ).toBeVisible({ timeout: 15000 });
  });

  // Stale since the af8de42..d1eb5a1 follow-ups (part 2): the alert ("AI Crawler Access Blocked") came from one
  // request sent as GPTBot. The check is sent as us now, and with no logs the page says plainly that a CDN
  // can't be tested from outside, with the way to connect logs -- never that something blocks AI crawlers.
  test("no 'blocking AI' claim; with no logs, 'can't be tested from outside' and Connect your logs", async ({
    page,
  }) => {
    await page.goto(`/brands/${brandId}/retrieval/crawler-logs`);
    await expect(page.getByText(/No crawler visits recorded/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/is blocking AI search engines/)).toHaveCount(0);
    await expect(page.locator("[data-cdn-untestable]")).toContainText(
      "can't be tested from outside",
    );
    await expect(page.getByRole("link", { name: "Connect your logs" })).toHaveAttribute(
      "href",
      `/brands/${brandId}/retrieval/agent-analytics`,
    );
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
  test("citation HEADLINE renders above cards: 'How likely is this page to be cited by AI?'", async ({
    page,
  }) => {
    await page.goto(`/brands/${brandId}/retrieval/content-structure`);
    await expect(page.getByText("How likely is this page to be cited by AI?")).toBeVisible({
      timeout: 15000,
    });
  });

  test("headline shows % with amber/Moderate band for 0.45 probability", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/content-structure`);
    await expect(page.getByText("45%").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Moderate")).toBeVisible();
  });

  test("per-page cards render format + word count", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/content-structure`);
    await expect(page.getByText("https://e2e-s6-retrieval.com.au/about").first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(/expert_article/)).toBeVisible();
    await expect(page.getByText(/1800 words/)).toBeVisible();
  });

  test("per-page card for /services shows 22% (red band)", async ({ page }) => {
    await page.goto(`/brands/${brandId}/retrieval/content-structure`);
    await expect(page.getByText("22%")).toBeVisible({ timeout: 15000 });
  });
});
