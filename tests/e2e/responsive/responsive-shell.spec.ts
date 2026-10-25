/**
 * The app shell on phones (Task 14): below 1024px the sidebar is a
 * drawer opened from the top bar's menu button.
 *
 * Every page below, at 320, 375, 768 and 1280px: no sideways scroll.
 * Signed-in pages also check the shell itself -- below 1024px the
 * sidebar is gone and the content is full width; at 1280px the sidebar
 * is back and the menu button isn't. Then the drawer (open, Esc, scrim,
 * close button, route change, focus, axe) and the audit #36 fixture at
 * 320px: "1 of 10 · 10%" in full and every directory URL on one line.
 *
 * Seeds its own org, user, brand, audits and action item in the e2e
 * database (never visibleau_prod) and deletes them afterwards.
 *
 * Run: npx playwright test --config tests/e2e/responsive/playwright.config.ts
 * Screenshots go to RESPONSIVE_SCREENSHOT_DIR (default
 * test-results/responsive-shell).
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";

const DB_URL = process.env.DATABASE_URL ?? "";
if (!DB_URL || DB_URL.includes("visibleau_prod")) {
  throw new Error("DATABASE_URL must point at the e2e database (load .env.test.local).");
}

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";
const SHOTS =
  process.env.RESPONSIVE_SCREENSHOT_DIR ?? path.resolve("test-results/responsive-shell");
const WIDTHS = [320, 375, 768, 1280] as const;
const LG = 1024;

const RUN = randomUUID().slice(0, 8);
const EMAIL = `responsive-${RUN}@test.visibleau.dev`;
const PASSWORD = "TestPass123!";
const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const FINISHED_AUDIT = randomUUID();
const RUNNING_AUDIT = randomUUID();
const ACTION_ITEM = randomUUID();
const PORTAL_TOKEN = `responsive-${RUN}-${randomUUID()}`;
const SAMPLE_BRAND = randomUUID();
const SAMPLE_AUDIT = randomUUID();
let sampleOrgId = "";
let createdSampleOrg = false;
let authUserId = "";

const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"] as const;
const EVERYDAY = Array.from(
  { length: 10 },
  (_, i) => `Who is a reliable plumber near Bondi? (${i})`,
);
const BRANDED = [
  "Is Omega Services a good choice for plumbing in Bondi?",
  "Omega Services vs Delta Plumbing — which is better in Bondi?",
  "What are the best alternatives to Omega Services in Bondi?",
];
const RANKED_MENTION =
  "Good local options:\n1. Alpha Plumbing\n2. Beta Plumbing\n3. Gamma Plumbing\n4. Omega Services, a Bondi plumber with fast call-outs.\n5. Delta Plumbing";
const NO_MENTION = "Good local options: Alpha Plumbing, Beta Plumbing and Gamma Plumbing.";
// Long enough to overflow a 320px screen on one line.
const LONG_HIPAGES =
  "https://hipages.com.au/connect/omegaservicesplumbingandgasfittingbondi/service/1234567";
const HIPAGES = [{ url: LONG_HIPAGES, domain: "hipages.com.au" }];

const sql = postgres(DB_URL, { max: 1 });

/** Shaped like production audit #36: Claude's about-the-business question
 * 12 failed, so every engine's "of n" is 10 and ChatGPT, Gemini and
 * Perplexity each mention the brand once ("1 of 10 · 10%"). */
async function seedFinishedAudit(
  orgId: string,
  brandId: string,
  auditId: string,
  n: number,
  metadata: Record<string, boolean> = {},
) {
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at, metadata)
    VALUES (${auditId}, ${brandId}, ${orgId}, ${n}, 'manual', 'complete', ${[...ENGINES]}, 4, 13, 1, 52, now() - interval '9 minutes', now(),
      ${sql.json(metadata)})
  `;
  const mentions = [
    { engine: "chatgpt", index: 0 },
    { engine: "gemini", index: 1 },
    { engine: "perplexity", index: 2 },
  ];
  const prompts = [...EVERYDAY, ...BRANDED];
  for (const engine of ENGINES) {
    for (const [index, prompt] of prompts.entries()) {
      const isBranded = index >= EVERYDAY.length;
      if (engine === "claude" && index === 12) {
        await sql`
          INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts, latency_ms, cost_usd)
          VALUES (${auditId}, ${orgId}, ${engine}, ${prompt}, ${index}, ${isBranded}, 'other', 'Bad request', 1, 1100, '0')
        `;
        continue;
      }
      const mentioned = isBranded || mentions.some((m) => m.engine === engine && m.index === index);
      const text = mentioned ? RANKED_MENTION : NO_MENTION;
      const sources = !isBranded && (mentioned || index === 9) ? HIPAGES : [];
      await sql`
        INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt, mention_verification, sentiment_label, context_label, response_text, response_snippet, cited_sources, llm_model, llm_cost_usd)
        VALUES (${auditId}, ${engine}, ${prompt}, ${index}, 1, ${mentioned}, ${isBranded},
          ${mentioned ? "verified_location" : null}, ${mentioned ? "positive" : "neutral"}, ${mentioned ? "listed" : "absent"},
          ${text}, ${text.slice(0, 500)}, ${sql.json(sources)}, 'test-model', '0.010000')
      `;
    }
  }
}

async function seedBrand(orgId: string, brandId: string) {
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${brandId}, ${orgId}, 'Omega Services', 'omegaservices.example.com.au', 'tradies', 'au',
      ARRAY[]::text[], 'Bondi', 'NSW',
      ${sql.json([...EVERYDAY, ...BRANDED])},
      ${PROMPT_GENERATOR_VERSION},
      'complete',
      ${sql.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')
  `;
}

/** Deletes every row this spec created for an org: its audits' citations
 * first, then each org-scoped table (retried until foreign keys allow). */
async function deleteOrgRows(orgId: string) {
  await sql`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ${orgId})`;
  const tables = await sql<{ table_name: string }[]>`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'organization_id'
      AND t.table_type = 'BASE TABLE' AND c.table_name <> 'organizations'
  `;
  let pending = tables.map((t) => t.table_name);
  for (let pass = 0; pass < 6 && pending.length > 0; pass++) {
    const failed: string[] = [];
    for (const table of pending) {
      try {
        await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${orgId}`;
      } catch {
        failed.push(table);
      }
    }
    pending = failed;
  }
  await sql`DELETE FROM organizations WHERE id = ${orgId}`;
}

test.beforeAll(async () => {
  const signUp = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ name: "Responsive Tester", email: EMAIL, password: PASSWORD }),
  });
  expect(signUp.ok, `sign-up returned ${signUp.status}`).toBe(true);
  const [authUser] = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE email = ${EMAIL}`;
  authUserId = authUser.id;

  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug, tier, onboarding_complete, metadata)
    VALUES (${ORG_ID}, ${`responsive-${RUN}`}, 'Responsive Test Agency', ${`responsive-${RUN}`}, 'agency_pro', true,
      ${sql.json({ productTourComplete: true })})
  `;
  await sql`
    INSERT INTO users (clerk_user_id, organization_id, email, name, role)
    VALUES (${authUserId}, ${ORG_ID}, ${EMAIL}, 'Responsive Tester', 'owner')
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_e2e_resp_${RUN}`}, ${`sub_e2e_resp_${RUN}`}, 'price_e2e_resp', 'agency_pro', 'monthly', 'active')
  `;
  await seedBrand(ORG_ID, BRAND_ID);
  await seedFinishedAudit(ORG_ID, BRAND_ID, FINISHED_AUDIT, 36);
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at)
    VALUES (${RUNNING_AUDIT}, ${BRAND_ID}, ${ORG_ID}, 37, 'manual', 'running', ${[...ENGINES]}, 4, 13, 1, 52, now() - interval '1 minute')
  `;
  await sql`
    INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, confidence_basis, expected_impact_score, evidence_refs)
    VALUES (${ACTION_ITEM}, ${ORG_ID}, ${BRAND_ID}, ${FINISHED_AUDIT}, 'directory-visibility', 'frequency',
      'AI cited hipages in 3 of 39 answers — confirm your status',
      'Check whether the hipages page AI cited is your own listing, and claim it if it is.',
      'likely', 'inferred', 'medium',
      ${sql.json([{ source: "hipages", url: LONG_HIPAGES, summary: "Cited in 3 of 39 answers.", sourceType: "checker" }])})
  `;
  await sql`
    INSERT INTO client_portal_invites (organization_id, brand_id, invite_token, invitee_name)
    VALUES (${ORG_ID}, ${BRAND_ID}, ${PORTAL_TOKEN}, 'Responsive Client')
  `;

  // The sample-audit result page only reads audits under the __sample__ org.
  const [sampleOrg] = await sql<
    { id: string }[]
  >`SELECT id FROM organizations WHERE slug = '__sample__'`;
  if (sampleOrg) {
    sampleOrgId = sampleOrg.id;
  } else {
    sampleOrgId = randomUUID();
    createdSampleOrg = true;
    await sql`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${sampleOrgId}, ${`responsive-sample-${RUN}`}, 'Sample audits', '__sample__')
    `;
  }
  await seedBrand(sampleOrgId, SAMPLE_BRAND);
  await seedFinishedAudit(sampleOrgId, SAMPLE_BRAND, SAMPLE_AUDIT, 1, { isSample: true });
});

test.afterAll(async () => {
  await deleteOrgRows(ORG_ID);
  if (createdSampleOrg) {
    await deleteOrgRows(sampleOrgId);
  } else {
    await sql`DELETE FROM citations WHERE audit_id = ${SAMPLE_AUDIT}`;
    await sql`DELETE FROM engine_call_failures WHERE audit_id = ${SAMPLE_AUDIT}`;
    await sql`DELETE FROM audits WHERE id = ${SAMPLE_AUDIT}`;
    await sql`DELETE FROM brands WHERE id = ${SAMPLE_BRAND}`;
  }
  if (authUserId) {
    await sql`DELETE FROM auth_sessions WHERE user_id = ${authUserId}`;
    await sql`DELETE FROM auth_accounts WHERE user_id = ${authUserId}`;
    await sql`DELETE FROM auth_users WHERE id = ${authUserId}`;
  }
  await sql.end();
});

async function signIn(page: Page) {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email: EMAIL, password: PASSWORD },
    headers: { Origin: BASE },
  });
  expect(res.ok(), `sign-in returned ${res.status()}`).toBe(true);
}

async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "load" });
  // Client components settle (the brand switcher fetches its list).
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
}

/**
 * Two ways a page can fail to fit:
 * - overflowing: it scrolls sideways -- the document, or the shell's own
 *   scrolling <main> (the outer frame is overflow: hidden, so the
 *   document alone would never show it);
 * - clipped: something runs off the right edge of the screen inside an
 *   overflow: hidden box (a card), so it's cut off rather than scrolled.
 *   An ellipsis is a deliberate cut, and a box that scrolls sideways on
 *   its own (a wide table) is fine.
 * Each lists the elements that stick out of a parent that fits, to say why.
 */
async function measureFit(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.querySelector<HTMLElement>("[data-app-main]");
    const width = window.innerWidth;
    const overflowing =
      doc.scrollWidth > width || (main !== null && main.scrollWidth > main.clientWidth);
    const culprits: string[] = [];
    const clipped: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= width + 1) continue;
      const parentRight = el.parentElement?.getBoundingClientRect().right ?? 0;
      if (parentRight > width + 1) continue;
      // The nearest box that doesn't just let it spill out.
      let box = el.parentElement;
      let overflowX = "visible";
      while (box && box !== main && box !== document.body) {
        overflowX = getComputedStyle(box).overflowX;
        if (overflowX !== "visible") break;
        box = box.parentElement;
      }
      const label = `${el.tagName.toLowerCase()} right=${Math.round(r.right)} "${(el.textContent ?? "").trim().slice(0, 40)}"`;
      if (!box || box === main || box === document.body) {
        if (culprits.length < 8) culprits.push(label);
      } else if (
        (overflowX === "hidden" || overflowX === "clip") &&
        getComputedStyle(box).textOverflow !== "ellipsis"
      ) {
        if (clipped.length < 8) clipped.push(label);
      }
    }
    return {
      docScrollWidth: doc.scrollWidth,
      mainScrollWidth: main?.scrollWidth ?? 0,
      mainClientWidth: main?.clientWidth ?? 0,
      innerWidth: width,
      overflowing,
      culprits,
      clipped,
    };
  });
}

interface PageCase {
  name: string;
  url: () => string;
  signedIn: boolean;
}

const PAGES: PageCase[] = [
  { name: "Overview", url: () => "/dashboard", signedIn: true },
  { name: "Brands", url: () => "/brands", signedIn: true },
  { name: "Audits list", url: () => "/audits", signedIn: true },
  { name: "Finished audit", url: () => `/audits/${FINISHED_AUDIT}`, signedIn: true },
  { name: "Running audit", url: () => `/audits/${RUNNING_AUDIT}`, signedIn: true },
  { name: "Action Center", url: () => "/action-center", signedIn: true },
  { name: "Action Center item", url: () => `/action-center/${ACTION_ITEM}`, signedIn: true },
  { name: "Methodology", url: () => "/methods", signedIn: true },
  { name: "Team", url: () => "/settings/team", signedIn: true },
  { name: "Data residency", url: () => "/settings/data-residency", signedIn: true },
  { name: "Client portal", url: () => `/client-portal/${PORTAL_TOKEN}`, signedIn: false },
  { name: "Sample audit", url: () => `/sample-audit/result/${SAMPLE_AUDIT}`, signedIn: false },
];

for (const p of PAGES) {
  test(`${p.name}: fits 320, 375, 768 and 1280px`, async ({ page }) => {
    if (p.signedIn) await signIn(page);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await open(page, p.url());
      if (p.signedIn) await expect(page.locator("[data-app-main]")).toBeVisible();

      const result = await measureFit(page);
      const where = `${p.name} at ${width}px: ${JSON.stringify(result)}`;
      expect.soft(result.overflowing, where).toBe(false);
      expect.soft(result.clipped, where).toEqual([]);

      if (!p.signedIn) continue;
      const sidebar = page.locator('aside[data-tour="sidebar"]');
      const menuButton = page.getByRole("button", { name: "Open menu" });
      if (width < LG) {
        await expect.soft(sidebar).toBeHidden();
        await expect.soft(menuButton).toBeVisible();
        const box = await page.locator("[data-app-main]").boundingBox();
        expect.soft(box?.width ?? 0).toBeGreaterThanOrEqual(width - 32);
        const padding = await page
          .locator("[data-app-main] > *")
          .first()
          .evaluate((el) => getComputedStyle(el).paddingLeft);
        expect.soft(padding, `${p.name} at ${width}px: side padding`).toBe("16px");
      } else {
        await expect.soft(sidebar).toBeVisible();
        await expect.soft(menuButton).toBeHidden();
      }
    }
  });
}

test.describe("drawer at 375px", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 375, height: 800 });
  });

  test("opens on tap; focus goes to the first link and stays inside", async ({ page }) => {
    await open(page, "/dashboard");
    const menuButton = page.getByRole("button", { name: "Open menu" });
    const drawer = page.getByRole("dialog", { name: "Main menu" });
    await expect(drawer).toBeHidden();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(menuButton).toHaveAttribute("aria-controls", "main-menu");

    await menuButton.click();
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(drawer.getByRole("link").first()).toBeFocused();
    // The active page is marked the same way as in the sidebar.
    await expect(drawer.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // The scrim covers the page behind, the cookie banner included (a
    // fresh browser hasn't answered it, so it's showing at the bottom).
    await expect(page.getByRole("button", { name: "Decline" })).toBeVisible();
    expect(
      await page.evaluate(() => document.elementFromPoint(360, 790)?.getAttribute("data-testid")),
    ).toBe("main-menu-scrim");
    // The page behind doesn't scroll.
    expect(
      await page.locator("[data-app-main]").evaluate((el) => getComputedStyle(el).overflowY),
    ).toBe("hidden");

    // Shift+Tab from the first link wraps to the last control; Tab wraps back.
    await page.keyboard.press("Shift+Tab");
    expect(await drawer.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Tab");
    await expect(drawer.getByRole("link").first()).toBeFocused();
    for (let i = 0; i < 30; i++) await page.keyboard.press("Tab");
    expect(await drawer.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  });

  test("closes on Esc, the scrim, the close button and route changes; focus returns", async ({
    page,
  }) => {
    await open(page, "/dashboard");
    const menuButton = page.getByRole("button", { name: "Open menu" });
    const drawer = page.getByRole("dialog", { name: "Main menu" });

    await menuButton.click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menuButton).toBeFocused();

    await menuButton.click();
    await expect(drawer).toBeVisible();
    // A tap on the scrim, to the right of the 320px-max drawer.
    await page.getByTestId("main-menu-scrim").click({ position: { x: 360, y: 400 } });
    await expect(drawer).toBeHidden();
    await expect(menuButton).toBeFocused();

    await menuButton.click();
    await drawer.getByRole("button", { name: "Close menu" }).click();
    await expect(drawer).toBeHidden();
    await expect(menuButton).toBeFocused();

    await menuButton.click();
    await drawer.getByRole("link", { name: "Brands" }).click();
    await page.waitForURL("**/brands");
    await expect(drawer).toBeHidden();
    await expect(menuButton).toBeFocused();

    // Tapping the page you're already on closes it too.
    await menuButton.click();
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Brands" }).click();
    await expect(drawer).toBeHidden();
    await expect(menuButton).toBeFocused();
  });

  test("no new axe violations on the open drawer", async ({ page }) => {
    // The desktop sidebar's own violations are the baseline: the drawer
    // shows the same contents, so only something it adds counts as new.
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, "/dashboard");
    const sidebar = await new AxeBuilder({ page }).include('aside[data-tour="sidebar"]').analyze();
    const baseline = new Set(sidebar.violations.map((v) => v.id));

    await page.setViewportSize({ width: 375, height: 800 });
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog", { name: "Main menu" })).toBeVisible();
    const drawer = await new AxeBuilder({ page }).include("#main-menu").analyze();
    const added = drawer.violations
      .filter((v) => !baseline.has(v.id))
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    console.log(
      `axe: sidebar baseline [${[...baseline].join(", ")}]; drawer [${drawer.violations
        .map((v) => v.id)
        .join(", ")}]`,
    );
    expect(added).toEqual([]);
  });

  test("screenshots: audit page and Action Center, drawer closed and open", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("cookie-consent", "declined");
      } catch {}
    });
    for (const [name, url] of [
      ["audit", `/audits/${FINISHED_AUDIT}`],
      ["action-center", "/action-center"],
    ] as const) {
      await open(page, url);
      await page.screenshot({ path: path.join(SHOTS, `${name}-375-closed.png`) });
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("dialog", { name: "Main menu" })).toBeVisible();
      // Let the 200ms slide finish.
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, `${name}-375-open.png`) });
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, `/audits/${FINISHED_AUDIT}`);
    await page.screenshot({ path: path.join(SHOTS, "audit-1280.png") });
  });
});

test("audit #36 at 320px: '1 of 10 · 10%' in full, each directory URL on one line", async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await open(page, `/audits/${FINISHED_AUDIT}`);

  for (const engine of ["chatgpt", "gemini", "perplexity"]) {
    const counts = page.locator(`#engine-${engine}-counts`);
    await expect(counts).toHaveText("1 of 10 · 10%");
    const fit = await counts.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const row = el.closest("figure")?.getBoundingClientRect();
      return {
        unclipped: el.scrollWidth <= el.clientWidth + 1,
        inside: r.left >= 0 && r.right <= window.innerWidth && (!row || r.right <= row.right + 1),
      };
    });
    expect(fit, engine).toEqual({ unclipped: true, inside: true });
  }

  const links = page.getByRole("region", { name: "Directories AI cited" }).getByRole("link");
  expect(await links.count()).toBeGreaterThan(0);
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute("href", LONG_HIPAGES);
    await expect(link).toHaveAttribute("title", LONG_HIPAGES);
    await expect(link).toHaveAttribute(
      "aria-label",
      /^Open hipages\.com\.au\/connect\/.+ in a new tab$/,
    );
    const shape = await link.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
      const r = el.getBoundingClientRect();
      return { lines: tops.size, inside: r.left >= 0 && r.right <= window.innerWidth };
    });
    expect(shape).toEqual({ lines: 1, inside: true });
  }
});
