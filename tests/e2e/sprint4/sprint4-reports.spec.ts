/**
 * tests/e2e/sprint4/sprint4-reports.spec.ts
 *
 * Playwright E2E: Sprint 4 Communication Layer — Reports UI
 *
 * Covers: 4A (reports list), 4B (auto-refresh/poll bug 9), 4C (tier gate),
 *         4D (report detail), 4E (template editor), 4F (delivery schedules).
 *
 * Database: DEV only (visibleau, NOT visibleau_prod).
 * LLM_MODE=mock, STORAGE_DRIVER=local (defaults via .env.test.local).
 *
 * Run: npx playwright test --config tests/e2e/sprint4/playwright.config.ts
 */

import { test, expect } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import {
  db,
  ensureOrganization,
  ensureUser,
} from "../helpers/db";
import {
  brands,
  generatedReports,
  subscriptions,
} from "@/db/schema";
import { signInAsTestUser } from "../helpers/auth";

/* ─── Database safety check ─────────────────────────────── */

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("visibleau_prod")) {
  throw new Error(
    "FATAL: DATABASE_URL points to PROD (visibleau_prod). " +
      "Sprint 4 E2E must run against DEV. Load .env.test.local.",
  );
}

/* ─── Test constants ────────────────────────────────────── */

const USER_1_CLERK_ID = process.env.E2E_TEST_USER_1_CLERK_ID ?? "";
const ORG_1_CLERK_ID = process.env.E2E_TEST_ORG_1_CLERK_ID ?? "";

let orgId = "";
let brandId = "";
let readyReportId = "";
let generatingReportId = "";

const E2E_BRAND_PREFIX = "E2E-S4";

/* ─── Seed / teardown helpers ───────────────────────────── */

async function cleanupBrandData(bId: string) {
  await db.delete(generatedReports).where(eq(generatedReports.brandId, bId));
  await db.execute(sql`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE brand_id = ${bId})`);
  await db.execute(sql`DELETE FROM audit_exports WHERE audit_id IN (SELECT id FROM audits WHERE brand_id = ${bId})`);
  await db.execute(sql`DELETE FROM technical_audits WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM drift_alerts WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM workflow_runs WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM local_seo_results WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM brand_entity_scores WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM audit_schedules WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM client_portal_invites WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM client_portal_views WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM remediation_tasks WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM action_items WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM content_drafts WHERE brand_id = ${bId}`);
  await db.execute(sql`DELETE FROM audits WHERE brand_id = ${bId}`);
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
    stripeCustomerId: `cus_e2e_s4_${oId.slice(0, 8)}`,
    stripeSubscriptionId: `sub_e2e_s4_${oId.slice(0, 8)}_${Date.now()}`,
    stripePriceId: "price_e2e_s4_test",
    tier,
    billingInterval: "monthly",
    status: "active",
  });
}

/* ─── Global setup / teardown ───────────────────────────── */

test.beforeAll(async () => {
  const org = await ensureOrganization({
    clerkOrgId: ORG_1_CLERK_ID,
    name: "E2E Sprint 4 Org",
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
      name: `${E2E_BRAND_PREFIX}-Reports`,
      domain: "e2e-s4-reports.com.au",
      vertical: "tradies",
      region: "au",
    })
    .returning();
  brandId = brand.id;

  // Seed a "ready" report (pdfUrl set)
  const [ready] = await db
    .insert(generatedReports)
    .values({
      brandId,
      organizationId: orgId,
      reportType: "weekly",
      periodLabel: "2026-W26",
      headline: "Weekly Visibility Report — W26",
      narrativeText: "Your brand visibility improved this week. Content performance increased by 12% across monitored AI engines.",
      pdfUrl: "reports/e2e-s4/ready-report.pdf",
      keyWins: [{ dimension: "content", scoreDelta: 3.2, description: "FAQ schema improved discovery" }],
      keyGaps: [{ dimension: "accuracy", score: 45.0, description: "Location data inconsistencies" }],
    })
    .returning();
  readyReportId = ready.id;

  // Seed a "generating" report (pdfUrl null)
  const [generating] = await db
    .insert(generatedReports)
    .values({
      brandId,
      organizationId: orgId,
      reportType: "weekly",
      periodLabel: "2026-W27",
      headline: "Weekly Visibility Report — W27",
      narrativeText: "Generating narrative...",
      pdfUrl: null,
    })
    .returning();
  generatingReportId = generating.id;
});

test.afterAll(async () => {
  await cleanupE2eBrands(orgId);
});

test.beforeEach(async ({ page }) => {
  await signInAsTestUser(page);
});

// ═══════════════════════════════════════════════════════════════
// 4A — Reports list renders seeded data (§6U.2)
// ═══════════════════════════════════════════════════════════════

test.describe("4A — Reports list", () => {
  test("renders seeded report cards with headline and period", async ({ page }) => {
    await page.goto(`/brands/${brandId}/reports`);
    await expect(page.getByText("Weekly Visibility Report — W26")).toBeVisible();
    await expect(page.getByText("2026-W26")).toBeVisible();
    await expect(page.getByText("Weekly Visibility Report — W27")).toBeVisible();
  });

  test("ready report shows Ready badge + enabled Download", async ({ page }) => {
    await page.goto(`/brands/${brandId}/reports`);
    await expect(page.getByText("Ready")).toBeVisible();
    // The ready report (W26) has "Download PDF" text with pointer-events: auto
    const downloadLink = page.getByText("Download PDF").first();
    await expect(downloadLink).toBeVisible();
    const pointerEvents = await downloadLink.evaluate(
      (el) => getComputedStyle(el).pointerEvents,
    );
    expect(pointerEvents).toBe("auto");
  });

  test("generating report shows Generating badge + disabled Download", async ({ page }) => {
    await page.goto(`/brands/${brandId}/reports`);
    await expect(page.getByText(/Generating/)).toBeVisible();
    const pendingLink = page.getByText("Pending...").first();
    await expect(pendingLink).toBeVisible();
    const pointerEvents = await pendingLink.evaluate(
      (el) => getComputedStyle(el).pointerEvents,
    );
    expect(pointerEvents).toBe("none");
  });

  test("empty state: brand with no reports shows empty message", async ({ page }) => {
    // Create a brand with no reports
    const [emptyBrand] = await db
      .insert(brands)
      .values({
        organizationId: orgId,
        name: `${E2E_BRAND_PREFIX}-Empty`,
        domain: "e2e-s4-empty.com.au",
        vertical: "saas",
        region: "au",
      })
      .returning();

    await page.goto(`/brands/${emptyBrand.id}/reports`);
    await expect(page.getByText(/no reports yet/i)).toBeVisible();

    await db.delete(brands).where(eq(brands.id, emptyBrand.id));
  });
});

// ═══════════════════════════════════════════════════════════════
// 4B — Auto-refresh / poll (★ BUG 9 END-TO-END)
// ═══════════════════════════════════════════════════════════════

test.describe("4B — Auto-refresh (bug 9 regression)", () => {
  test("generating report auto-flips to Ready WITHOUT reload, then polling STOPS", async ({ page }) => {
    // Ensure only the generating report exists for cleaner assertion
    await db.delete(generatedReports).where(eq(generatedReports.id, readyReportId));
    await db
      .update(generatedReports)
      .set({ pdfUrl: null })
      .where(eq(generatedReports.id, generatingReportId));

    await page.goto(`/brands/${brandId}/reports`);
    await expect(page.getByText(/Generating/)).toBeVisible({ timeout: 10000 });

    // Capture GET poll requests
    const pollHits: number[] = [];
    page.on("request", (r) => {
      if (
        r.url().includes(`/api/brands/${brandId}/reports`) &&
        r.method() === "GET" &&
        !r.url().includes("/generate")
      ) {
        pollHits.push(Date.now());
      }
    });

    // Simulate Inngest completion: update pdfUrl in DB (the poll will pick this up)
    await page.waitForTimeout(2000); // let at least one poll fire
    await db
      .update(generatedReports)
      .set({ pdfUrl: "reports/e2e-s4/now-ready.pdf" })
      .where(eq(generatedReports.id, generatingReportId));

    // 1) Badge flips to Ready WITHOUT page.reload() — the poll does it
    await expect(page.getByText("Ready")).toBeVisible({ timeout: 15000 });

    // 2) Download link becomes enabled
    const downloadLink = page.getByRole("link", { name: /download/i }).first();
    await expect(downloadLink).toBeVisible({ timeout: 5000 });

    // 3) Polling STOPS after Ready (the key bug-9 assertion)
    const countAtReady = pollHits.length;
    await page.waitForTimeout(8000);
    expect(pollHits.length).toBe(countAtReady); // no more polls after Ready

    // Restore state for other tests
    await db
      .update(generatedReports)
      .set({ pdfUrl: null })
      .where(eq(generatedReports.id, generatingReportId));
    await db
      .insert(generatedReports)
      .values({
        id: readyReportId,
        brandId,
        organizationId: orgId,
        reportType: "weekly",
        periodLabel: "2026-W26",
        headline: "Weekly Visibility Report — W26",
        narrativeText: "Your brand visibility improved this week. Content performance increased by 12% across monitored AI engines.",
        pdfUrl: "reports/e2e-s4/ready-report.pdf",
        keyWins: [{ dimension: "content", scoreDelta: 3.2, description: "FAQ schema improved discovery" }],
        keyGaps: [{ dimension: "accuracy", score: 45.0, description: "Location data inconsistencies" }],
      });
  });

  test("awaitingReport keeps polling alive in the race window (POST 202 before Inngest row exists)", async ({ page }) => {
    // 1) Start with ZERO reports for this brand (the race precondition)
    await db.delete(generatedReports).where(eq(generatedReports.brandId, brandId));

    // 2) Intercept the generate POST → return 202 without Inngest (simulates real async gap)
    await page.route(`**/api/brands/${brandId}/reports/generate`, (route) =>
      route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ message: "Report generation started", periodLabel: "2026-W28" }),
      }),
    );

    await page.goto(`/brands/${brandId}/reports`);
    await expect(page.getByText(/no reports yet/i)).toBeVisible({ timeout: 10000 });

    // 3) Capture GET /reports polls
    const polls: number[] = [];
    page.on("request", (r) => {
      if (
        r.url().includes(`/api/brands/${brandId}/reports`) &&
        r.method() === "GET" &&
        !r.url().includes("/generate")
      ) {
        polls.push(Date.now());
      }
    });

    // 4) Click Generate → page sets awaitingReport=true. No row exists yet.
    const pollsBeforeClick = polls.length;
    await page.getByRole("button", { name: /generate report/i }).click();

    // 5) DECISIVE: polling MUST fire while the list is still EMPTY.
    //    With awaitingReport: shouldPollReports([], true) → true → poll fires.
    //    Without awaitingReport: shouldPollReports([], false) → false → no poll → this times out.
    await expect
      .poll(() => polls.length, {
        timeout: 12000,
        message: "poll must fire while list is empty (awaitingReport bridge)",
      })
      .toBeGreaterThan(pollsBeforeClick);

    // 6) Simulate Inngest: insert the report row (pdfUrl null = generating)
    const [inserted] = await db
      .insert(generatedReports)
      .values({
        brandId,
        organizationId: orgId,
        reportType: "weekly",
        periodLabel: "2026-W28",
        headline: "Weekly Visibility Report — W28",
        narrativeText: "Generating...",
        pdfUrl: null,
      })
      .returning();

    // Poll picks up the new row → "Generating" badge appears
    await expect(page.getByText(/Generating/)).toBeVisible({ timeout: 15000 });

    // 7) Simulate render complete: set pdfUrl
    await db
      .update(generatedReports)
      .set({ pdfUrl: "reports/e2e-s4/race-ready.pdf" })
      .where(eq(generatedReports.id, inserted.id));

    // 8) Badge flips to Ready WITHOUT reload
    await expect(page.getByText("Ready")).toBeVisible({ timeout: 15000 });

    // 9) Polling STOPS after all reports ready
    const countAtReady = polls.length;
    await page.waitForTimeout(8000);
    expect(polls.length).toBe(countAtReady);

    // Restore: re-seed the original reports for subsequent tests
    await db.delete(generatedReports).where(eq(generatedReports.brandId, brandId));
    await db.insert(generatedReports).values([
      {
        id: readyReportId,
        brandId,
        organizationId: orgId,
        reportType: "weekly",
        periodLabel: "2026-W26",
        headline: "Weekly Visibility Report — W26",
        narrativeText: "Your brand visibility improved this week. Content performance increased by 12% across monitored AI engines.",
        pdfUrl: "reports/e2e-s4/ready-report.pdf",
        keyWins: [{ dimension: "content", scoreDelta: 3.2, description: "FAQ schema improved discovery" }],
        keyGaps: [{ dimension: "accuracy", score: 45.0, description: "Location data inconsistencies" }],
      },
      {
        id: generatingReportId,
        brandId,
        organizationId: orgId,
        reportType: "weekly",
        periodLabel: "2026-W27",
        headline: "Weekly Visibility Report — W27",
        narrativeText: "Generating narrative...",
        pdfUrl: null,
      },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4C — Reports tier gate (Growth+ required)
// ═══════════════════════════════════════════════════════════════

test.describe("4C — Reports tier gate", () => {
  test("Agency tier: reports list accessible", async ({ page }) => {
    await ensureSubscription(orgId, "agency");
    await page.goto(`/brands/${brandId}/reports`);
    await expect(page.getByRole("heading", { name: /reports/i })).toBeVisible({ timeout: 15000 });
  });

  test("Starter tier: shows locked teaser, not the list", async ({ page }) => {
    await ensureSubscription(orgId, "starter");
    await page.goto(`/brands/${brandId}/reports`);
    await expect(page.getByText(/Growth.*plan required/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /upgrade/i })).toBeVisible();
    await expect(page.getByText("Weekly Visibility Report")).not.toBeVisible();

    // Restore for other tests
    await ensureSubscription(orgId, "agency");
  });

  test("Growth tier: reports list accessible", async ({ page }) => {
    await ensureSubscription(orgId, "growth");
    await page.goto(`/brands/${brandId}/reports`);
    await expect(page.getByRole("heading", { name: /reports/i })).toBeVisible({ timeout: 15000 });

    await ensureSubscription(orgId, "agency");
  });
});

// ═══════════════════════════════════════════════════════════════
// 4D — Report detail page (§6U.3)
// ═══════════════════════════════════════════════════════════════

test.describe("4D — Report detail", () => {
  test("clicking a Ready report navigates to detail with narrative prose", async ({ page }) => {
    await page.goto(`/brands/${brandId}/reports/${readyReportId}`);
    await expect(page.getByText(/brand visibility improved|Restored for subsequent/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("link", { name: /download pdf/i }).first()).toBeVisible();
  });

  test("detail page shows key wins section", async ({ page }) => {
    await page.goto(`/brands/${brandId}/reports/${readyReportId}`);
    await expect(page.getByText("Key Wins")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/FAQ schema improved/i)).toBeVisible();
  });

  test("generating report detail shows generating state", async ({ page }) => {
    await page.goto(`/brands/${brandId}/reports/${generatingReportId}`);
    await expect(page.getByText("Your report is being generated...")).toBeVisible({ timeout: 10000 });
  });
});

// ═══════════════════════════════════════════════════════════════
// 4E — Template editor (§6U.4 — org-scoped, nav-orphaned)
// ═══════════════════════════════════════════════════════════════

test.describe("4E — Template editor (direct URL only — nav-orphaned)", () => {
  test("page loads and shows Report Templates heading", async ({ page }) => {
    await page.goto(`/organizations/${orgId}/report-templates`);
    await expect(page.getByRole("heading", { name: /report templates/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /new template/i })).toBeVisible();
  });

  test("new template form shows 12 section checkboxes", async ({ page }) => {
    await page.goto(`/organizations/${orgId}/report-templates`);
    await page.getByRole("button", { name: /new template/i }).click();
    await expect(page.getByText("Executive Summary")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Evidence Snapshots")).toBeVisible();
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    expect(count).toBe(12);
  });

  test("tone selector shows professional/plain english/executive", async ({ page }) => {
    await page.goto(`/organizations/${orgId}/report-templates`);
    await page.getByRole("button", { name: /new template/i }).click();
    await expect(page.getByRole("button", { name: "professional" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "plain english" })).toBeVisible();
    await expect(page.getByRole("button", { name: "executive" })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════
// 4F — Delivery schedule form (§6U.5 — Agency+ gate)
// ═══════════════════════════════════════════════════════════════

test.describe("4F — Delivery schedules (direct URL only — nav-orphaned)", () => {
  test("Agency tier: page loads with Delivery Schedules heading", async ({ page }) => {
    await ensureSubscription(orgId, "agency");
    await page.goto(`/organizations/${orgId}/delivery-schedules`);
    await expect(page.getByRole("heading", { name: /delivery schedules/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /new schedule/i })).toBeVisible();
  });

  test("weekly frequency shows Day of Week select with days", async ({ page }) => {
    await ensureSubscription(orgId, "agency");
    await page.goto(`/organizations/${orgId}/delivery-schedules`);
    await page.getByRole("button", { name: /new schedule/i }).click();
    // weekly is default — Day of Week label visible
    await expect(page.getByText("Day of Week")).toBeVisible({ timeout: 5000 });
    // Monday option exists in the select
    await expect(page.locator("option", { hasText: "Monday" })).toBeAttached();
  });

  test("monthly frequency shows Day of Month field", async ({ page }) => {
    await ensureSubscription(orgId, "agency");
    await page.goto(`/organizations/${orgId}/delivery-schedules`);
    await page.getByRole("button", { name: /new schedule/i }).click();
    // Switch frequency select to monthly
    await page.locator("select").first().selectOption("monthly");
    await expect(page.getByText(/day of month/i)).toBeVisible({ timeout: 5000 });
    // Day of Week should no longer be visible
    await expect(page.getByText("Day of Week")).not.toBeVisible();
  });

  test("Starter tier: delivery schedules shows Agency tier gate", async ({ page }) => {
    await ensureSubscription(orgId, "starter");
    await page.goto(`/organizations/${orgId}/delivery-schedules`);
    await expect(page.getByText(/agency tier/i)).toBeVisible({ timeout: 10000 });
    await ensureSubscription(orgId, "agency");
  });
});
