/**
 * tests/e2e/sprint8/s8-governance-e2e.spec.ts
 *
 * Playwright E2E: Sprint 8 Governance Intelligence — 5 scenarios
 *
 * 5.1: F6/F2 functional provisioning (real org-create via sign-up page)
 * 5.2: F18 tier-gate (Agency full vs Growth locked)
 * 5.3: HIGH-12 viewer blocked from audit-trail
 * 5.4: Audit-trail walk mirror
 * 5.5: Data-residency + team walk mirror + nav reachability
 *
 * Database: DEV only (visibleau, NOT visibleau_prod).
 * LLM_MODE=mock via .env.test.local.
 *
 * Run: npx playwright test --config tests/e2e/sprint8/playwright.config.ts
 */

import { test, expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import {
  db,
  ensureOrganization,
  ensureUser,
} from "../helpers/db";
import {
  auditTrail,
  authUsers,
  authAccounts,
  authMembers,
  authOrganizations,
  authSessions,
  dataResidencyLog,
  orgMembers,
  organizations,
  reportTemplates,
  subscriptions,
  users,
} from "@/db/schema";

/* ─── Database safety check ─────────────────────────────── */

const DB_URL = process.env.DATABASE_URL ?? "";
if (DB_URL.includes("visibleau_prod")) {
  throw new Error(
    "FATAL: DATABASE_URL points to PROD (visibleau_prod). " +
      "Sprint 8 E2E must run against DEV. Load .env.test.local.",
  );
}

/* ─── Constants ─────────────────────────────────────────── */

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";
const USER_1_CLERK_ID = process.env.E2E_TEST_USER_1_CLERK_ID ?? "";
const ORG_1_CLERK_ID = process.env.E2E_TEST_ORG_1_CLERK_ID ?? "";

const E2E_PREFIX = "E2E-S8";
const VIEWER_EMAIL = "s8viewer@test.visibleau.dev";
const VIEWER_PASSWORD = "TestPass123!";
const PROVISION_EMAIL_PREFIX = "s8provision";

let orgId = "";
let userId = "";
let originalUserOrgId = "";
let originalUserName = "";

/* ─── Auth helpers ──────────────────────────────────────── */

async function signInAs(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 30_000, waitUntil: "domcontentloaded" });
}

async function registerAuthUser(email: string, password: string, name: string): Promise<void> {
  await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ name, email, password }),
  }).catch(() => {});
}

/* ─── DB seed helpers ───────────────────────────────────── */

async function ensureSubscription(oId: string, tier: string) {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, oId));
  if (existing) {
    if (existing.tier !== tier) {
      await db.update(subscriptions).set({ tier, updatedAt: new Date() }).where(eq(subscriptions.id, existing.id));
    }
    return;
  }
  await db.insert(subscriptions).values({
    organizationId: oId,
    stripeCustomerId: `cus_e2e_s8_${oId.slice(0, 8)}`,
    stripeSubscriptionId: `sub_e2e_s8_${oId.slice(0, 8)}_${Date.now()}`,
    stripePriceId: "price_e2e_s8_test",
    tier,
    billingInterval: "monthly",
    status: "active",
  });
}

async function seedAuditEntry(oId: string, uId: string, action: string, meta?: Record<string, unknown>) {
  await db.insert(auditTrail).values({
    organizationId: oId,
    userId: uId,
    action,
    resourceType: "brand",
    resourceId: "00000000-0000-0000-0000-000000000001",
    metadata: meta ?? null,
  });
}

async function cleanupProvisionedOrg(email: string) {
  const [authUser] = await db.select().from(authUsers).where(eq(authUsers.email, email));
  if (!authUser) return;

  const [appUser] = await db.select().from(users).where(eq(users.email, email));
  if (appUser) {
    await db.delete(dataResidencyLog).where(eq(dataResidencyLog.organizationId, appUser.organizationId)).catch(() => {});
    await db.delete(orgMembers).where(eq(orgMembers.organizationId, appUser.organizationId)).catch(() => {});
    await db.delete(auditTrail).where(eq(auditTrail.organizationId, appUser.organizationId)).catch(() => {});
    await db.delete(reportTemplates).where(eq(reportTemplates.organizationId, appUser.organizationId)).catch(() => {});
    await db.delete(subscriptions).where(eq(subscriptions.organizationId, appUser.organizationId)).catch(() => {});
    await db.delete(users).where(eq(users.organizationId, appUser.organizationId)).catch(() => {});
    await db.delete(organizations).where(eq(organizations.id, appUser.organizationId)).catch(() => {});
  }

  await db.delete(authSessions).where(eq(authSessions.userId, authUser.id)).catch(() => {});
  await db.delete(authMembers).where(eq(authMembers.userId, authUser.id)).catch(() => {});
  await db.delete(authAccounts).where(eq(authAccounts.userId, authUser.id)).catch(() => {});

  const [authOrg] = await db.select().from(authOrganizations).where(eq(authOrganizations.name, `${E2E_PREFIX} Provision Org`));
  if (authOrg) {
    await db.delete(authMembers).where(eq(authMembers.organizationId, authOrg.id)).catch(() => {});
    await db.delete(authOrganizations).where(eq(authOrganizations.id, authOrg.id)).catch(() => {});
  }

  await db.delete(authUsers).where(eq(authUsers.id, authUser.id)).catch(() => {});
}

/* ═══════════════════════════════════════════════════════════
 * Global setup / teardown
 * ═══════════════════════════════════════════════════════════ */

test.beforeAll(async () => {
  const org = await ensureOrganization({
    clerkOrgId: ORG_1_CLERK_ID,
    name: `${E2E_PREFIX} Governance Org`,
    tier: "agency",
  });
  orgId = org.id;

  const user = await ensureUser({
    clerkUserId: USER_1_CLERK_ID,
    organizationId: orgId,
    email: process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local",
    name: "E2E Owner",
  });
  userId = user.id;
  originalUserOrgId = user.organizationId;
  originalUserName = user.name ?? "";

  // ensureUser returns existing row without updating — force org + name for test assertions
  await db.update(users).set({ organizationId: orgId, name: "E2E Owner" }).where(eq(users.clerkUserId, USER_1_CLERK_ID));
  await db.insert(orgMembers).values({
    organizationId: orgId,
    userId: userId,
    role: "owner",
    brandAccess: null,
    isActive: true,
    acceptedAt: new Date(),
  }).onConflictDoNothing();

  await ensureSubscription(orgId, "agency");

  await db.delete(auditTrail).where(eq(auditTrail.organizationId, orgId)).catch(() => {});
  await seedAuditEntry(orgId, userId, "audit_triggered", { brandId: "00000000-0000-0000-0000-000000000001", scope: "full" });
  await seedAuditEntry(orgId, userId, "report_generated");
  await seedAuditEntry(orgId, userId, "member_invited", { invitedEmail: "analyst@test.dev", role: "analyst" });

  await registerAuthUser(VIEWER_EMAIL, VIEWER_PASSWORD, "S8 Viewer");
  const [viewerAuth] = await db.select().from(authUsers).where(eq(authUsers.email, VIEWER_EMAIL));
  if (viewerAuth) {
    await db.insert(users).values({
      clerkUserId: viewerAuth.id,
      organizationId: orgId,
      email: VIEWER_EMAIL,
      name: "S8 Viewer",
      role: "viewer",
    }).onConflictDoNothing();

    // Always force-update: prior runs may have left stale organizationId
    await db.update(users).set({ organizationId: orgId, role: "viewer" }).where(eq(users.email, VIEWER_EMAIL));

    const [existingViewer] = await db.select().from(users).where(eq(users.email, VIEWER_EMAIL));
    if (existingViewer) {
      // Replace any stale org_members entries
      await db.delete(orgMembers).where(eq(orgMembers.userId, existingViewer.id)).catch(() => {});
      await db.insert(orgMembers).values({
        organizationId: orgId,
        userId: existingViewer.id,
        role: "viewer",
        brandAccess: null,
        isActive: true,
        acceptedAt: new Date(),
      });
    }
  }
});

test.afterAll(async () => {
  // Restore main user to their original org + name
  if (originalUserOrgId && originalUserOrgId !== orgId) {
    await db.update(users).set({ organizationId: originalUserOrgId, name: originalUserName || "E2E Owner" }).where(eq(users.clerkUserId, USER_1_CLERK_ID));
    await db.delete(orgMembers).where(and(eq(orgMembers.organizationId, orgId), eq(orgMembers.userId, userId))).catch(() => {});
  }
  await db.delete(auditTrail).where(eq(auditTrail.organizationId, orgId)).catch(() => {});
  const [viewerApp] = await db.select().from(users).where(eq(users.email, VIEWER_EMAIL));
  if (viewerApp) {
    await db.delete(orgMembers).where(eq(orgMembers.userId, viewerApp.id)).catch(() => {});
  }
});

/* ═══════════════════════════════════════════════════════════
 * 5.1 — F6/F2 FUNCTIONAL PROVISIONING
 * ═══════════════════════════════════════════════════════════ */

test.describe("5.1 — F6/F2 functional provisioning (real org-create)", () => {
  const provisionEmail = `${PROVISION_EMAIL_PREFIX}-${Date.now()}@test.visibleau.dev`;
  const provisionOrgName = `${E2E_PREFIX} Provision Org`;

  test.beforeAll(async () => {
    // Pre-clean stale auth org from prior runs (slug conflict prevents org-create)
    const staleOrgs = await db.select().from(authOrganizations)
      .where(eq(authOrganizations.name, provisionOrgName));
    for (const sOrg of staleOrgs) {
      await db.delete(authMembers).where(eq(authMembers.organizationId, sOrg.id)).catch(() => {});
      await db.delete(authOrganizations).where(eq(authOrganizations.id, sOrg.id)).catch(() => {});
    }
  });

  test.afterAll(async () => {
    await cleanupProvisionedOrg(provisionEmail);
  });

  test("sign-up creates owner org_members row + 7 data_residency_log rows via provisioning", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/sign-up");

    const nameInput = page.locator('input[id="signup-name"]');
    await expect(nameInput).toBeVisible({ timeout: 15_000 });

    await nameInput.fill("Provision Test User");
    await page.locator('input[id="signup-agency"]').fill(provisionOrgName);
    await page.locator('input[id="signup-email"]').fill(provisionEmail);
    await page.locator('input[id="signup-password"]').fill("TestPass123!");

    await page.locator('button[type="submit"]').click();

    // Wait for either dashboard redirect or form error
    try {
      await page.waitForURL("**/dashboard**", { timeout: 60_000, waitUntil: "domcontentloaded" });
    } catch {
      const url = page.url();
      const errorText = await page.locator('[style*="danger"]').first().textContent().catch(() => null);
      const bodyText = await page.locator("main").textContent().catch(() => null);
      throw new Error(
        `Sign-up did not redirect to /dashboard.\n` +
        `Current URL: ${url}\n` +
        `Error on page: ${errorText ?? "(none)"}\n` +
        `Body: ${bodyText?.slice(0, 300) ?? "(empty)"}`,
      );
    }

    const [appUser] = await db.select().from(users).where(eq(users.email, provisionEmail));
    expect(appUser, "app user created by provisioning").toBeTruthy();

    const provOrgId = appUser!.organizationId;

    const ownerRows = await db
      .select()
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.organizationId, provOrgId),
          eq(orgMembers.role, "owner"),
          eq(orgMembers.isActive, true),
        ),
      );
    expect(ownerRows.length, "owner org_members row exists (F6 — NOT test-seeded)").toBeGreaterThanOrEqual(1);
    const ownerRow = ownerRows[0];
    expect(ownerRow.brandAccess).toBeNull();

    const residencyRows = await db
      .select()
      .from(dataResidencyLog)
      .where(eq(dataResidencyLog.organizationId, provOrgId));
    expect(residencyRows.length, "7 data_residency_log rows from provisioning (F2)").toBe(7);

    const dataTypes = residencyRows.map((r) => r.dataType).sort();
    expect(dataTypes).toEqual([
      "audit_data",
      "crawler_logs",
      "evidence_snapshots",
      "llm_cache",
      "llm_processing_anthropic",
      "llm_processing_openai",
      "pdf_reports",
    ]);
  });

  test("provisioned org's data-residency page renders the 7 rows", async ({ page }) => {
    await signInAs(page, provisionEmail, "TestPass123!");
    await page.goto("/settings/data-residency");

    await expect(page.getByRole("heading", { name: /Data Residency/i })).toBeVisible({ timeout: 10_000 });

    // Wait through the §6U.4 graceful loading states (skeletons → "Residency information loading…")
    // before asserting the table — on a cold, just-provisioned org the two sequential fetches
    // (/api/auth/me → …/data-residency) can take longer than 10s under dev-server load.
    await page.waitForResponse(
      (r) => r.url().includes("/data-residency") && r.status() === 200,
      { timeout: 30_000 },
    );

    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("tbody tr")).toHaveCount(7, { timeout: 10_000 });

    for (const provider of ["OpenAI", "Anthropic", "Supabase"]) {
      await expect(table.getByText(provider, { exact: false }).first()).toBeVisible();
    }
  });
});

/* ═══════════════════════════════════════════════════════════
 * 5.2 — F18 tier-gate end-to-end (Agency full vs Growth locked)
 * ═══════════════════════════════════════════════════════════ */

test.describe("5.2 — F18 tier-gate (Agency full vs Growth locked)", () => {
  test.afterAll(async () => {
    await ensureSubscription(orgId, "agency");
    await db.update(organizations).set({ tier: "agency" }).where(eq(organizations.id, orgId));
  });

  test("Agency-tier org → /settings/team renders full page (no lock overlay)", async ({ page }) => {
    await ensureSubscription(orgId, "agency");
    await db.update(organizations).set({ tier: "agency" }).where(eq(organizations.id, orgId));

    await signInAs(page, process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local", process.env.E2E_TEST_USER_PASSWORD ?? "password123");
    await page.goto("/settings/team");

    await expect(page.getByRole("heading", { name: /Team/i }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Invite member")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Agency plan required")).not.toBeVisible();
  });

  test("Growth-tier org → /settings/team shows locked overlay", async ({ page }) => {
    await ensureSubscription(orgId, "growth");
    await db.update(organizations).set({ tier: "growth" }).where(eq(organizations.id, orgId));

    await signInAs(page, process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local", process.env.E2E_TEST_USER_PASSWORD ?? "password123");
    await page.goto("/settings/team");

    await expect(page.getByText("Agency plan required")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Upgrade/i })).toBeVisible();
  });
});

/* ═══════════════════════════════════════════════════════════
 * 5.3 — HIGH-12 viewer blocked from audit-trail
 * ═══════════════════════════════════════════════════════════ */

test.describe("5.3 — HIGH-12 viewer blocked from audit-trail", () => {
  test("viewer cannot access audit-trail (403 / error)", async ({ page }) => {
    await signInAs(page, VIEWER_EMAIL, VIEWER_PASSWORD);
    await page.goto("/settings/audit-trail");

    await expect(
      page.getByText(/Failed to load|Forbidden|Access denied/i),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('[class*="audit-log"]').or(page.getByText("Triggered audit"))).not.toBeVisible();
  });

  test("owner CAN access audit-trail (log renders)", async ({ page }) => {
    await signInAs(page, process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local", process.env.E2E_TEST_USER_PASSWORD ?? "password123");
    await page.goto("/settings/audit-trail");

    await expect(page.getByRole("heading", { name: /Audit Trail/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Triggered audit")).toBeVisible({ timeout: 10_000 });
  });
});

/* ═══════════════════════════════════════════════════════════
 * 5.4 — Audit-trail walk mirror
 * ═══════════════════════════════════════════════════════════ */

test.describe("5.4 — Audit-trail walk mirror", () => {
  test("rows render: action label + resource badge + actor + timestamp", async ({ page }) => {
    await signInAs(page, process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local", process.env.E2E_TEST_USER_PASSWORD ?? "password123");
    await page.goto("/settings/audit-trail");

    await expect(page.getByText("Triggered audit")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Generated report")).toBeVisible();
    await expect(page.getByText("Invited member")).toBeVisible();

    await expect(page.getByText("brand").first()).toBeVisible();
    await expect(page.getByText(/by E2E Owner/i).first()).toBeVisible();
  });

  test("F21 metadata expand: Details button → reveals key/value pairs", async ({ page }) => {
    await signInAs(page, process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local", process.env.E2E_TEST_USER_PASSWORD ?? "password123");
    await page.goto("/settings/audit-trail");

    const detailsBtn = page.getByRole("button", { name: /Details/i }).first();
    await expect(detailsBtn).toBeVisible({ timeout: 10_000 });
    await expect(detailsBtn).toHaveAttribute("aria-expanded", "false");

    await detailsBtn.click();
    await expect(detailsBtn).toHaveAttribute("aria-expanded", "true");

    // First Details is "Invited member" → metadata has invitedEmail + role
    await expect(page.getByText("invitedEmail").first()).toBeVisible();
    await expect(page.getByText("analyst@test.dev").first()).toBeVisible();
  });

  test("pagination controls render with proper disabled states", async ({ page }) => {
    await signInAs(page, process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local", process.env.E2E_TEST_USER_PASSWORD ?? "password123");
    await page.goto("/settings/audit-trail");

    await expect(page.getByText("Triggered audit")).toBeVisible({ timeout: 10_000 });

    const prevBtn = page.getByRole("button", { name: /Previous/i });
    await expect(prevBtn).toBeVisible();
    await expect(prevBtn).toBeDisabled();

    await expect(page.getByText("Page 1")).toBeVisible();
  });

  test("empty org shows 'No activity yet'", async ({ browser }) => {
    const emptyOrgClerkId = `e2e-s8-empty-${Date.now()}`;
    const emptyOrg = await ensureOrganization({
      clerkOrgId: emptyOrgClerkId,
      name: `${E2E_PREFIX} Empty Audit Org`,
      tier: "agency",
    });
    const emptyEmail = `s8empty-${Date.now()}@test.visibleau.dev`;
    await registerAuthUser(emptyEmail, "TestPass123!", "S8 Empty User");

    const [emptyAuth] = await db.select().from(authUsers).where(eq(authUsers.email, emptyEmail));
    if (emptyAuth) {
      await db.insert(users).values({
        clerkUserId: emptyAuth.id,
        organizationId: emptyOrg.id,
        email: emptyEmail,
        name: "S8 Empty User",
        role: "owner",
      }).onConflictDoNothing();

      const [emptyUser] = await db.select().from(users).where(eq(users.email, emptyEmail));
      if (emptyUser) {
        await db.insert(orgMembers).values({
          organizationId: emptyOrg.id,
          userId: emptyUser.id,
          role: "owner",
          brandAccess: null,
          isActive: true,
          acceptedAt: new Date(),
        }).onConflictDoNothing();
      }

      await ensureSubscription(emptyOrg.id, "agency");

      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await signInAs(page, emptyEmail, "TestPass123!");
      await page.goto("/settings/audit-trail");

      await expect(page.getByText("No activity yet")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Actions will appear here/)).toBeVisible();

      await ctx.close();

      await db.delete(orgMembers).where(eq(orgMembers.organizationId, emptyOrg.id)).catch(() => {});
      await db.delete(subscriptions).where(eq(subscriptions.organizationId, emptyOrg.id)).catch(() => {});
      await db.delete(users).where(eq(users.organizationId, emptyOrg.id)).catch(() => {});
      await db.delete(organizations).where(eq(organizations.id, emptyOrg.id)).catch(() => {});
      await db.delete(authSessions).where(eq(authSessions.userId, emptyAuth.id)).catch(() => {});
      await db.delete(authAccounts).where(eq(authAccounts.userId, emptyAuth.id)).catch(() => {});
      await db.delete(authUsers).where(eq(authUsers.id, emptyAuth.id)).catch(() => {});
    }
  });
});

/* ═══════════════════════════════════════════════════════════
 * 5.5 — Data-residency + Team walk mirror + nav reachability
 * ═══════════════════════════════════════════════════════════ */

test.describe("5.5 — Data-residency + team walk + nav reachability", () => {
  test.beforeAll(async () => {
    await ensureSubscription(orgId, "agency");
    await db.update(organizations).set({ tier: "agency" }).where(eq(organizations.id, orgId));
  });

  test("data-residency renders 7 rows with correct providers (F13)", async ({ page }) => {
    await signInAs(page, process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local", process.env.E2E_TEST_USER_PASSWORD ?? "password123");
    await page.goto("/settings/data-residency");

    await expect(page.getByRole("heading", { name: /Data Residency/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Primary region: Australia (ap-southeast-2)")).toBeVisible();

    const table = page.locator("table");
    await expect(table).toBeVisible({ timeout: 10_000 });

    for (const header of ["Data Type", "Location", "Provider", "Retention", "Encryption"]) {
      await expect(table.getByText(header)).toBeVisible();
    }

    await expect(table.getByText("OpenAI").first()).toBeVisible();
    await expect(table.getByText("Anthropic").first()).toBeVisible();
    await expect(table.getByText("Supabase").first()).toBeVisible();

    await expect(page.getByText("Data Processing Agreement")).toBeVisible();
  });

  test("team page renders members table + invite form", async ({ page }) => {
    await signInAs(page, process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local", process.env.E2E_TEST_USER_PASSWORD ?? "password123");
    await page.goto("/settings/team");

    await expect(page.getByRole("heading", { name: /Team/i }).first()).toBeVisible({ timeout: 10_000 });

    for (const col of ["Member", "Role", "Brand access", "Joined", "Actions"]) {
      await expect(page.getByText(col, { exact: true }).first()).toBeVisible();
    }

    await expect(page.getByText("Invite member")).toBeVisible();

    const emailInput = page.locator('input[placeholder="colleague@company.com"]');
    await expect(emailInput).toBeVisible();

    await expect(page.getByText("Brand access").first()).toBeVisible();
  });

  test("F3 nav reachability: sidebar links navigate to governance screens", async ({ page }) => {
    await signInAs(page, process.env.E2E_TEST_USER_EMAIL ?? "sri@visibleau.local", process.env.E2E_TEST_USER_PASSWORD ?? "password123");
    await page.goto("/dashboard");

    const teamLink = page.getByRole("link", { name: /Team/i });
    await expect(teamLink).toBeVisible({ timeout: 10_000 });
    await teamLink.click();
    await expect(page).toHaveURL(/\/settings\/team/, { timeout: 10_000 });

    await page.goto("/dashboard");
    const auditLink = page.getByRole("link", { name: /Audit Trail/i });
    await expect(auditLink).toBeVisible({ timeout: 10_000 });
    await auditLink.click();
    await expect(page).toHaveURL(/\/settings\/audit-trail/, { timeout: 10_000 });

    await page.goto("/dashboard");
    const residencyLink = page.getByRole("link", { name: /Data residency/i });
    await expect(residencyLink).toBeVisible({ timeout: 10_000 });
    await residencyLink.click();
    await expect(page).toHaveURL(/\/settings\/data-residency/, { timeout: 10_000 });
  });
});
