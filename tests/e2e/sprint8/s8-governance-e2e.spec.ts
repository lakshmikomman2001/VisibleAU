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
 * Database: the local e2e database only (visibleau_e2e), via .env.test.local.
 * LLM_MODE=mock via .env.test.local.
 *
 * Run: npx playwright test --config tests/e2e/sprint8/playwright.config.ts
 */

import { expect, type Page, test } from "@playwright/test";
import { createEmailVerificationToken } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import {
  auditTrail,
  authAccounts,
  authMembers,
  authOrganizations,
  authSessions,
  authUsers,
  dataResidencyLog,
  organizations,
  orgMembers,
  reportTemplates,
  subscriptions,
  users,
} from "@/db/schema";
import { newWorkspacePath, verifiedLandingPath } from "@/lib/auth/paths";
import { RESIDENCY_CONFIG } from "@/lib/governance/residency-config";
import { db } from "../helpers/db";
import {
  addSpecBrand,
  createSpecAccount,
  removeSpecAccount,
  type SpecAccount,
  setSpecPlan,
  signInThroughForm,
} from "../helpers/spec-account";

/* ─── Constants ─────────────────────────────────────────── */

const E2E_PREFIX = "E2E-S8";
const PROVISION_EMAIL_PREFIX = "s8provision";

// The owner and a viewer in the owner's workspace, each its own account
// (tests/e2e/helpers/spec-account.ts; the local e2e database only). This used to move E2E_TEST_USER_1's
// profile into the spec's workspace and back, and that profile belongs to the integration suite.
let owner: SpecAccount;
let viewer: SpecAccount;
let orgId = "";
let userId = "";

/* ─── Auth helpers ──────────────────────────────────────── */

async function signInAs(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // A new workspace with no brand lands on /brands/wizard, not /dashboard.
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
}

/* ─── DB seed helpers ───────────────────────────────────── */

async function seedAuditEntry(
  oId: string,
  uId: string,
  action: string,
  meta?: Record<string, unknown>,
) {
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
    await db
      .delete(dataResidencyLog)
      .where(eq(dataResidencyLog.organizationId, appUser.organizationId))
      .catch(() => {});
    await db
      .delete(orgMembers)
      .where(eq(orgMembers.organizationId, appUser.organizationId))
      .catch(() => {});
    await db
      .delete(auditTrail)
      .where(eq(auditTrail.organizationId, appUser.organizationId))
      .catch(() => {});
    await db
      .delete(reportTemplates)
      .where(eq(reportTemplates.organizationId, appUser.organizationId))
      .catch(() => {});
    await db
      .delete(subscriptions)
      .where(eq(subscriptions.organizationId, appUser.organizationId))
      .catch(() => {});
    await db
      .delete(users)
      .where(eq(users.organizationId, appUser.organizationId))
      .catch(() => {});
    await db
      .delete(organizations)
      .where(eq(organizations.id, appUser.organizationId))
      .catch(() => {});
  }

  await db
    .delete(authSessions)
    .where(eq(authSessions.userId, authUser.id))
    .catch(() => {});
  await db
    .delete(authMembers)
    .where(eq(authMembers.userId, authUser.id))
    .catch(() => {});
  await db
    .delete(authAccounts)
    .where(eq(authAccounts.userId, authUser.id))
    .catch(() => {});

  const [authOrg] = await db
    .select()
    .from(authOrganizations)
    .where(eq(authOrganizations.name, `${E2E_PREFIX} Provision Org`));
  if (authOrg) {
    await db
      .delete(authMembers)
      .where(eq(authMembers.organizationId, authOrg.id))
      .catch(() => {});
    await db
      .delete(authOrganizations)
      .where(eq(authOrganizations.id, authOrg.id))
      .catch(() => {});
  }

  await db
    .delete(authUsers)
    .where(eq(authUsers.id, authUser.id))
    .catch(() => {});
}

/* ═══════════════════════════════════════════════════════════
 * Global setup / teardown
 * ═══════════════════════════════════════════════════════════ */

test.beforeAll(async () => {
  owner = await createSpecAccount({ key: "sprint8-owner", plan: "agency", name: "E2E Owner" });
  orgId = owner.organizationId;
  userId = owner.userId;
  // With no brand, /dashboard sends the owner to the wizard.
  await addSpecBrand(owner, {
    name: `${E2E_PREFIX} Governance Co`,
    domain: "e2e-s8.example.com.au",
  });

  await seedAuditEntry(orgId, userId, "audit_triggered", {
    brandId: "00000000-0000-0000-0000-000000000001",
    scope: "full",
  });
  await seedAuditEntry(orgId, userId, "report_generated");
  await seedAuditEntry(orgId, userId, "member_invited", {
    invitedEmail: "analyst@test.dev",
    role: "analyst",
  });

  viewer = await createSpecAccount({
    key: "sprint8-viewer",
    plan: null,
    name: "S8 Viewer",
    memberOf: { owner, role: "viewer" },
  });
});

test.afterAll(async () => {
  await removeSpecAccount(owner);
  await removeSpecAccount(viewer);
});

/* ═══════════════════════════════════════════════════════════
 * 5.1 — F6/F2 FUNCTIONAL PROVISIONING
 * ═══════════════════════════════════════════════════════════ */

test.describe("5.1 — F6/F2 functional provisioning (real org-create)", () => {
  // The second test signs in as the account the first makes (S3, 9 Nov: it signed in as one that
  // was never created).
  test.describe.configure({ mode: "serial" });
  const provisionEmail = `${PROVISION_EMAIL_PREFIX}-${Date.now()}@test.visibleau.dev`;
  const provisionOrgName = `${E2E_PREFIX} Provision Org`;

  test.beforeAll(async () => {
    // Pre-clean stale auth org from prior runs (slug conflict prevents org-create)
    const staleOrgs = await db
      .select()
      .from(authOrganizations)
      .where(eq(authOrganizations.name, provisionOrgName));
    for (const sOrg of staleOrgs) {
      await db
        .delete(authMembers)
        .where(eq(authMembers.organizationId, sOrg.id))
        .catch(() => {});
      await db
        .delete(authOrganizations)
        .where(eq(authOrganizations.id, sOrg.id))
        .catch(() => {});
    }
  });

  test.afterAll(async () => {
    await cleanupProvisionedOrg(provisionEmail);
  });

  test("sign-up creates owner org_members row + its data_residency_log rows via provisioning", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/sign-up");

    const nameInput = page.locator('input[id="signup-name"]');
    await expect(nameInput).toBeVisible({ timeout: 15_000 });

    await nameInput.fill("Provision Test User");
    await page.locator('input[id="signup-agency"]').fill(provisionOrgName);
    await page.locator('input[id="signup-email"]').fill(provisionEmail);
    await page.locator('input[id="signup-password"]').fill("TestPass123!");

    await page.locator('button[type="submit"]').click();

    // Since fa8b823 (3 Nov) sign-up stops at "Check your inbox" until the address is verified. The
    // link the email carries (better-auth's own token) comes back through sign-in to /no-workspace
    // with the agency's name, where "Create workspace" provisions it -- what a real sign-up does.
    await expect(page.getByText(/Check your inbox to verify/)).toBeVisible({ timeout: 60_000 });
    const token = await createEmailVerificationToken(
      process.env.BETTER_AUTH_SECRET ?? "",
      provisionEmail,
    );
    const landing = verifiedLandingPath(newWorkspacePath(provisionOrgName));
    await page.goto(
      `/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(landing)}`,
    );
    await expect(page.getByText(/Your email address is confirmed/)).toBeVisible({
      timeout: 30_000,
    });
    await page.fill('input[type="email"]', provisionEmail);
    await page.fill('input[type="password"]', "TestPass123!");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/no-workspace/, { timeout: 60_000 });
    await expect(page.locator("#workspace-name")).toHaveValue(provisionOrgName);
    await page.getByRole("button", { name: "Create workspace" }).click();
    // A new workspace's dashboard sends it on to add its first brand.
    await page.waitForURL(/\/(dashboard|brands\/wizard)/, { timeout: 60_000 });

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
    expect(
      ownerRows.length,
      "owner org_members row exists (F6 — NOT test-seeded)",
    ).toBeGreaterThanOrEqual(1);
    const ownerRow = ownerRows[0];
    expect(ownerRow.brandAccess).toBeNull();

    const residencyRows = await db
      .select()
      .from(dataResidencyLog)
      .where(eq(dataResidencyLog.organizationId, provOrgId));
    // One row per lib/governance/residency-config.ts entry: 13 since 392aff5 (19 Sep), not 7.
    expect(residencyRows.length, "a data_residency_log row per configured data type (F2)").toBe(
      RESIDENCY_CONFIG.length,
    );

    const dataTypes = residencyRows.map((r) => r.dataType).sort();
    expect(dataTypes).toEqual(RESIDENCY_CONFIG.map((c) => c.dataType).sort());
  });

  test("provisioned org's data-residency page renders its rows", async ({ page }) => {
    await signInAs(page, provisionEmail, "TestPass123!");
    await page.goto("/settings/data-residency");

    await expect(page.getByRole("heading", { name: /Data Residency/i })).toBeVisible({
      timeout: 10_000,
    });

    // Wait through the §6U.4 graceful loading states (skeletons → "Residency information loading…")
    // before asserting the table — on a cold, just-provisioned org the two sequential fetches
    // (/api/auth/me → …/data-residency) can take longer than 10s under dev-server load.
    await page.waitForResponse((r) => r.url().includes("/data-residency") && r.status() === 200, {
      timeout: 30_000,
    });

    // One table per kind of processor (database, file storage, LLM processing...) since 392aff5
    // (19 Sep), a row per configured data type.
    const tables = page.locator("table");
    await expect(tables.first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("tbody tr")).toHaveCount(RESIDENCY_CONFIG.length, {
      timeout: 10_000,
    });

    for (const provider of ["OpenAI", "Anthropic", "Supabase"]) {
      await expect(tables.getByText(provider, { exact: false }).first()).toBeVisible();
    }
  });
});

/* ═══════════════════════════════════════════════════════════
 * 5.2 — F18 tier-gate end-to-end (Agency full vs Growth locked)
 * ═══════════════════════════════════════════════════════════ */

test.describe("5.2 — F18 tier-gate (Agency full vs Growth locked)", () => {
  test.afterAll(async () => {
    await setSpecPlan(owner, "agency");
  });

  test("Agency-tier org → /settings/team renders full page (no lock overlay)", async ({ page }) => {
    await setSpecPlan(owner, "agency");

    await signInThroughForm(page, owner);
    await page.goto("/settings/team");

    await expect(page.getByRole("heading", { name: /Team/i }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Invite member")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Agency plan required")).not.toBeVisible();
  });

  test("Growth-tier org → /settings/team shows its seats taken and a way to more", async ({
    page,
  }) => {
    await setSpecPlan(owner, "growth");

    await signInThroughForm(page, owner);
    await page.goto("/settings/team");

    // 6 Nov: the seat count from lib/pricing/tiers.ts (Growth has one), in place of the
    // Agency-only overlay this page used to show.
    await expect(page.getByText(/of 1 seat used/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: "See the plans with more seats" })).toHaveAttribute(
      "href",
      "/pricing",
    );
    await expect(page.getByText("Agency plan required")).not.toBeVisible();
  });
});

/* ═══════════════════════════════════════════════════════════
 * 5.3 — HIGH-12 viewer blocked from audit-trail
 * ═══════════════════════════════════════════════════════════ */

test.describe("5.3 — HIGH-12 viewer blocked from audit-trail", () => {
  test("viewer cannot access audit-trail (403 / error)", async ({ page }) => {
    await signInThroughForm(page, viewer);
    await page.goto("/settings/audit-trail");

    await expect(page.getByText(/Failed to load|Forbidden|Access denied/i)).toBeVisible({
      timeout: 15_000,
    });

    await expect(
      page.locator('[class*="audit-log"]').or(page.getByText("Triggered audit")),
    ).not.toBeVisible();
  });

  test("owner CAN access audit-trail (log renders)", async ({ page }) => {
    await signInThroughForm(page, owner);
    await page.goto("/settings/audit-trail");

    await expect(page.getByRole("heading", { name: /Audit Trail/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Triggered audit")).toBeVisible({ timeout: 10_000 });
  });
});

/* ═══════════════════════════════════════════════════════════
 * 5.4 — Audit-trail walk mirror
 * ═══════════════════════════════════════════════════════════ */

test.describe("5.4 — Audit-trail walk mirror", () => {
  test("rows render: action label + resource badge + actor + timestamp", async ({ page }) => {
    await signInThroughForm(page, owner);
    await page.goto("/settings/audit-trail");

    await expect(page.getByText("Triggered audit")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Generated report")).toBeVisible();
    await expect(page.getByText("Invited member")).toBeVisible();

    await expect(page.getByText("brand").first()).toBeVisible();
    await expect(page.getByText(/by E2E Owner/i).first()).toBeVisible();
  });

  test("F21 metadata expand: Details button → reveals key/value pairs", async ({ page }) => {
    await signInThroughForm(page, owner);
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
    await signInThroughForm(page, owner);
    await page.goto("/settings/audit-trail");

    await expect(page.getByText("Triggered audit")).toBeVisible({ timeout: 10_000 });

    const prevBtn = page.getByRole("button", { name: /Previous/i });
    await expect(prevBtn).toBeVisible();
    await expect(prevBtn).toBeDisabled();

    await expect(page.getByText("Page 1")).toBeVisible();
  });

  test("empty org shows 'No activity yet'", async ({ browser }) => {
    const empty = await createSpecAccount({ key: "sprint8-empty", plan: "agency" });
    try {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await signInThroughForm(page, empty);
      await page.goto("/settings/audit-trail");

      await expect(page.getByText("No activity yet")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Actions will appear here/)).toBeVisible();

      await ctx.close();
    } finally {
      await removeSpecAccount(empty);
    }
  });
});

/* ═══════════════════════════════════════════════════════════
 * 5.5 — Data-residency + Team walk mirror + nav reachability
 * ═══════════════════════════════════════════════════════════ */

test.describe("5.5 — Data-residency + team walk + nav reachability", () => {
  test.beforeAll(async () => {
    await setSpecPlan(owner, "agency");
  });

  test("data-residency renders 7 rows with correct providers (F13)", async ({ page }) => {
    await signInThroughForm(page, owner);
    await page.goto("/settings/data-residency");

    await expect(page.getByRole("heading", { name: /Data Residency/i })).toBeVisible({
      timeout: 10_000,
    });
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
    await signInThroughForm(page, owner);
    await page.goto("/settings/team");

    await expect(page.getByRole("heading", { name: /Team/i }).first()).toBeVisible({
      timeout: 10_000,
    });

    for (const col of ["Member", "Role", "Brand access", "Joined", "Actions"]) {
      await expect(page.getByText(col, { exact: true }).first()).toBeVisible();
    }

    await expect(page.getByText("Invite member")).toBeVisible();

    const emailInput = page.locator('input[placeholder="colleague@company.com"]');
    await expect(emailInput).toBeVisible();

    await expect(page.getByText("Brand access").first()).toBeVisible();
  });

  test("F3 nav reachability: sidebar links navigate to governance screens", async ({ page }) => {
    await signInThroughForm(page, owner);
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
