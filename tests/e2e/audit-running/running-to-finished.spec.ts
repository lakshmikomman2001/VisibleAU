/**
 * URGENT audit #37 (31 Oct), item 3 -- the running page switches to the
 * results by itself. Production stayed on "Audit in progress" (every
 * step ticked, 100%) until Ctrl+Shift+R.
 *
 * In a real browser, without a reload, within 15 s of the audit row
 * turning terminal:
 * - running -> complete: the finished page;
 * - running -> complete when the first refresh after completion comes
 *   back stale (still the running view): the page still gets there;
 * - running -> failed: the failed view.
 *
 * URGENT audit #38 (1 Nov): production's page froze early (Perplexity 1
 * of 13, the rest 0). The early-state test opens that state, adds
 * answers, and checks the page follows them and still responds.
 *
 * Seeds its own org, user, brand and audits in the e2e database (never
 * visibleau_prod) and deletes them afterwards.
 *
 * Run: npx playwright test --config tests/e2e/audit-running/playwright.config.ts
 */
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";

const DB_URL = process.env.DATABASE_URL ?? "";
if (!DB_URL || DB_URL.includes("visibleau_prod")) {
  throw new Error("DATABASE_URL must point at the e2e database (load .env.test.local).");
}

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";
const RUN = randomUUID().slice(0, 8);
const EMAIL = `running-${RUN}@test.visibleau.dev`;
const PASSWORD = "TestPass123!";
const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"] as const;
const CREDIT = "Your credit balance is too low to access the Anthropic API.";
const MENTION = "Good local options: Omega Services, a Bondi plumber with fast call-outs.";
const NONE = "Good local options: Alpha Plumbing and Beta Plumbing.";
/** The terminal-state budget from the task: 15 s. */
const SWITCH_WITHIN_MS = 15_000;
let authUserId = "";
let auditNumber = 40;

const sql = postgres(DB_URL, { max: 1 });

/** Audit #37's shape, with every call finished but the audit not yet finalized. */
async function seedRunningAudit(): Promise<string> {
  const id = randomUUID();
  auditNumber += 1;
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at)
    VALUES (${id}, ${BRAND_ID}, ${ORG_ID}, ${auditNumber}, 'manual', 'running', ${[...ENGINES]}, 4, 13, 1, 52, now() - interval '2 minutes')
  `;
  for (const engine of ENGINES) {
    for (let i = 0; i < 13; i++) {
      if (engine === "claude") {
        await sql`
          INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts, latency_ms, cost_usd)
          VALUES (${id}, ${ORG_ID}, 'claude', ${`q${i}`}, ${i}, ${i >= 10}, 'other', ${CREDIT}, 1, 400, '0')
        `;
        continue;
      }
      const mentioned = i < 2;
      await sql`
        INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt, sentiment_label, context_label, response_text, response_snippet, cited_sources, llm_model, llm_cost_usd)
        VALUES (${id}, ${engine}, ${`q${i}`}, ${i}, 1, ${mentioned}, ${i >= 10}, 'neutral', 'absent',
          ${mentioned ? MENTION : NONE}, ${mentioned ? MENTION : NONE}, ${sql.json([])}, 'test-model', '0.010000')
      `;
    }
  }
  return id;
}

/** One everyday answer from `engine` to question `i`. */
async function insertAnswer(id: string, engine: string, i: number) {
  await sql`
    INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt, sentiment_label, context_label, response_text, response_snippet, cited_sources, llm_model, llm_cost_usd)
    VALUES (${id}, ${engine}, ${`q${i}`}, ${i}, 1, false, false, 'neutral', 'absent',
      ${NONE}, ${NONE}, ${sql.json([])}, 'test-model', '0.010000')
  `;
}

/** Audit #38's early state: Perplexity has answered 1 of 13, the other engines nothing yet. */
async function seedEarlyAudit(): Promise<string> {
  const id = randomUUID();
  auditNumber += 1;
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at)
    VALUES (${id}, ${BRAND_ID}, ${ORG_ID}, ${auditNumber}, 'manual', 'running', ${[...ENGINES]}, 4, 13, 1, 52, now() - interval '20 seconds')
  `;
  await insertAnswer(id, "perplexity", 0);
  return id;
}

/** What both runners' finalize writes. */
async function finalize(id: string) {
  await sql`
    UPDATE audits SET status = 'complete', completed_at = now(), score_composite = '16.67',
      metadata = metadata || ${sql.json({ engineFailures: { claude: 13 } })}
    WHERE id = ${id}
  `;
}

test.beforeAll(async () => {
  const signUp = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ name: "Running Tester", email: EMAIL, password: PASSWORD }),
  });
  expect(signUp.ok, `sign-up returned ${signUp.status}`).toBe(true);
  const [authUser] = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE email = ${EMAIL}`;
  authUserId = authUser.id;
  // Sign-in needs a verified address.
  await sql`UPDATE auth_users SET email_verified = true WHERE id = ${authUserId}`;
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug, tier, onboarding_complete, metadata)
    VALUES (${ORG_ID}, ${`running-${RUN}`}, 'Running Test Agency', ${`running-${RUN}`}, 'agency_pro', true,
      ${sql.json({ productTourComplete: true })})
  `;
  await sql`
    INSERT INTO users (clerk_user_id, organization_id, email, name, role)
    VALUES (${authUserId}, ${ORG_ID}, ${EMAIL}, 'Running Tester', 'owner')
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_e2e_run_${RUN}`}, ${`sub_e2e_run_${RUN}`}, 'price_e2e_run', 'agency_pro', 'monthly', 'active')
  `;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Omega Services', 'omega-running.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
});

test.afterAll(async () => {
  await sql`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ${ORG_ID})`;
  await sql`DELETE FROM engine_call_failures WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM action_items WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
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

/** Open the running page and mark this document, so a reload would be visible. */
async function openRunning(page: Page, auditId: string) {
  await signIn(page);
  await page.goto(`/audits/${auditId}`);
  await expect(page.getByText("Running audit for Omega Services")).toBeVisible({
    timeout: 120_000,
  });
  await page.evaluate(() => {
    (window as unknown as { __sameDocument: string }).__sameDocument = "yes";
  });
}

async function expectSameDocument(page: Page) {
  const marker = await page.evaluate(
    () => (window as unknown as { __sameDocument?: string }).__sameDocument ?? null,
  );
  expect(marker, "the page reloaded instead of switching in place").toBe("yes");
}

/** The finished page's own header (not the running view's). */
function finishedView(page: Page) {
  return page.getByText(/Audit #\d+ · /).first();
}

test("running -> complete: the finished page within 15 s, without a reload", async ({ page }) => {
  const auditId = await seedRunningAudit();
  await openRunning(page, auditId);
  await expect(page.getByText("52 calls finished")).toBeVisible();

  await finalize(auditId);
  const flippedAt = Date.now();
  await expect(finishedView(page)).toBeVisible({ timeout: SWITCH_WITHIN_MS });
  expect(Date.now() - flippedAt).toBeLessThanOrEqual(SWITCH_WITHIN_MS);
  await expect(page.getByText("Running audit for Omega Services")).toHaveCount(0);
  await expect(page.locator("[data-engine-total-failure]")).toBeVisible();
  await expectSameDocument(page);
});

test("running -> complete when the first refresh comes back stale: still the finished page", async ({
  page,
}) => {
  const auditId = await seedRunningAudit();
  await openRunning(page, auditId);

  // Capture what a refresh returns while the audit is still running
  // ("Skip and view raw output" refreshes the route).
  const isRefresh = (url: URL, headers: Record<string, string>) =>
    url.pathname === `/audits/${auditId}` && headers.rsc === "1";
  const staleResponse = page.waitForResponse((r) =>
    isRefresh(new URL(r.url()), r.request().headers()),
  );
  await page.getByRole("button", { name: /Skip and view raw output/ }).click();
  const stale = await staleResponse;
  const staleBody = await stale.body();
  const staleHeaders = stale.headers();
  await expect(page.getByText("Running audit for Omega Services")).toBeVisible();

  // The first refresh after completion gets that running-view payload back.
  let servedStale = false;
  await page.route(
    (url) => url.pathname === `/audits/${auditId}`,
    async (route, request) => {
      if (!servedStale && request.headers().rsc === "1") {
        servedStale = true;
        await route.fulfill({ status: 200, headers: staleHeaders, body: staleBody });
        return;
      }
      await route.continue();
    },
  );

  await finalize(auditId);
  const flippedAt = Date.now();
  await expect(finishedView(page)).toBeVisible({ timeout: SWITCH_WITHIN_MS });
  expect(servedStale, "the stale refresh was never requested").toBe(true);
  expect(Date.now() - flippedAt).toBeLessThanOrEqual(SWITCH_WITHIN_MS);
  await expectSameDocument(page);
});

test("early state (audit #38): the page follows new answers and still responds", async ({
  page,
}) => {
  const auditId = await seedEarlyAudit();
  await openRunning(page, auditId);
  await expect(page.getByText("1 of 52 calls finished")).toBeVisible();
  // The engine rows come from the first poll.
  await expect(page.locator('[data-engine-row="perplexity"]')).toContainText("1 of 13 answered", {
    timeout: SWITCH_WITHIN_MS,
  });
  await expect(page.locator('[data-engine-row="chatgpt"]')).toContainText("0 of 13 answered");

  // More answers arrive; polls are never more than 10 s apart.
  for (let i = 1; i < 4; i++) await insertAnswer(auditId, "perplexity", i);
  await insertAnswer(auditId, "chatgpt", 0);
  await expect(page.getByText("5 of 52 calls finished")).toBeVisible({
    timeout: SWITCH_WITHIN_MS,
  });
  await expect(page.locator('[data-engine-row="chatgpt"]')).toContainText("1 of 13 answered");

  // A frozen tab wouldn't answer this quickly.
  const askedAt = Date.now();
  await page.evaluate(() => document.querySelectorAll("[data-engine-row]").length);
  expect(Date.now() - askedAt).toBeLessThan(1_000);
  await expect(page.getByText(/NaN|Infinity/)).toHaveCount(0);
  await expect(page.getByText("Still running · results will appear when done")).toHaveCount(0);
  await expectSameDocument(page);
});

test("running -> failed: the failed view within 15 s, without a reload", async ({ page }) => {
  const auditId = await seedRunningAudit();
  await openRunning(page, auditId);

  await sql`
    UPDATE audits SET status = 'failed',
      metadata = metadata || ${sql.json({ error: "Stopped: no progress for 10 minutes" })}
    WHERE id = ${auditId}
  `;
  const flippedAt = Date.now();
  await expect(page.getByText("Audit failed")).toBeVisible({ timeout: SWITCH_WITHIN_MS });
  expect(Date.now() - flippedAt).toBeLessThanOrEqual(SWITCH_WITHIN_MS);
  await expectSameDocument(page);
});
