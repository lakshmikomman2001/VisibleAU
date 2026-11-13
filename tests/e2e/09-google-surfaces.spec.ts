/**
 * Google AI surfaces, Phase 1, part 4 -- the audit page's "Google Search AI" block and the operator's
 * /admin/settings, at 375px and 1280px: each shows what it should and fits the width (no sideways scroll).
 *
 * The audit's Google rows are built from DataForSEO's REAL 11 Nov responses (tests/fixtures/google-surfaces/
 * dataforseo/, parsed by the app's own lib/serp/dataforseo.ts); nothing calls the provider. The operator is
 * an account whose address the e2e server was started with in PLATFORM_ADMIN_EMAILS:
 *   PLATFORM_ADMIN_EMAILS=google-surfaces-operator@example.test pnpm e2e:server
 * (DEV/TEST DB ONLY: tests/e2e/helpers/e2e-database.ts refuses any other database.)
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { parseDataForSeoResult } from "@/lib/serp/dataforseo";
import { e2eDatabaseUrl } from "./helpers/e2e-database";

const sql = postgres(e2eDatabaseUrl(), { max: 2 });
const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";
const EMAIL = "google-surfaces-operator@example.test";
const PASSWORD = `Pw-${randomUUID()}`;
const RUN = randomUUID().slice(0, 8);
const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const FIXTURES = path.join(process.cwd(), "tests/fixtures/google-surfaces/dataforseo");
const QUESTIONS = ["q01", "q07", "q11", "q13"];

function fixture(name: string) {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8")) as {
    tasks: { data: { keyword: string }; result: Record<string, unknown>[] }[];
  };
}

async function deleteOperator() {
  const users = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE email = ${EMAIL}`;
  for (const u of users) {
    await sql`DELETE FROM org_members WHERE user_id IN (SELECT id FROM users WHERE clerk_user_id = ${u.id})`.catch(
      () => {},
    );
    await sql`DELETE FROM users WHERE clerk_user_id = ${u.id}`.catch(() => {});
    await sql`DELETE FROM auth_sessions WHERE user_id = ${u.id}`.catch(() => {});
    await sql`DELETE FROM auth_accounts WHERE user_id = ${u.id}`.catch(() => {});
    await sql`DELETE FROM auth_users WHERE id = ${u.id}`.catch(() => {});
  }
}

async function deleteOrg() {
  await sql`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ${ORG_ID})`;
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
        await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${ORG_ID}`;
      } catch {
        failed.push(table);
      }
    }
    pending = failed;
  }
  await sql`DELETE FROM feature_setting_changes WHERE target_workspace_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
}

test.beforeAll(async () => {
  await deleteOperator();
  const signUp = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ name: "Google Operator", email: EMAIL, password: PASSWORD }),
  });
  expect(signUp.ok, `sign-up: ${signUp.status}`).toBe(true);
  const [authUser] = await sql<{ id: string }[]>`SELECT id FROM auth_users WHERE email = ${EMAIL}`;
  await sql`UPDATE auth_users SET email_verified = true WHERE id = ${authUser.id}`;
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`google-e2e-${RUN}`}, 'Google Surfaces Demo Workspace', ${`google-e2e-${RUN}`})
  `;
  await sql`
    INSERT INTO users (clerk_user_id, organization_id, email, name, role)
    VALUES (${authUser.id}, ${ORG_ID}, ${EMAIL}, 'Google Operator', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, invited_at, accepted_at, is_active)
    SELECT ${ORG_ID}, id, 'owner', now(), now(), true FROM users WHERE clerk_user_id = ${authUser.id}
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_e2e_google_${RUN}`}, ${`sub_e2e_google_${RUN}`}, 'price_e2e_google', 'growth', 'monthly', 'active')
  `;
  const questions = QUESTIONS.map((q) => fixture(`aio-task-get-${q}.json`).tasks[0].data.keyword);
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack,
      prompt_pack_generator_version, classification_status, classification, categories, audience,
      category_confirmed_at, suburb, state, country, location_mode, location_confirmed_at)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Omega Services', 'omegaservices.com.au', 'tradies', 'au',
      ARRAY['NSW:Norwest']::text[], ${sql.json(questions)}, ${PROMPT_GENERATOR_VERSION}, 'complete',
      ${sql.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      ARRAY['trades_plumbing']::text[], 'households', now(), 'Norwest', 'NSW', 'Australia', 'fixed', now())
  `;
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines,
      engine_count, prompts_count, runs_per_prompt, total_calls, score_composite, started_at, completed_at)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'manual', 'complete', ARRAY['chatgpt']::text[], 1,
      ${questions.length}, 1, ${questions.length}, 0, now() - interval '5 minutes', now())
  `;
  // The four engines' side: one ChatGPT answer per question, so the page is a finished audit's.
  for (const [i, prompt] of questions.entries()) {
    const text = `A plain answer about ${prompt} that names no business.`;
    await sql`
      INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt,
        mention_verification, sentiment_label, context_label, response_text, response_snippet, cited_sources,
        llm_model, llm_cost_usd)
      VALUES (${AUDIT_ID}, 'chatgpt', ${prompt}, ${i}, 1, false, ${i >= 2}, null, 'neutral', 'absent', ${text},
        ${text}, ${sql.json([])}, 'test-model', '0.001000')
    `;
  }
  await sql`
    INSERT INTO audit_google_surfaces (audit_id, organization_id, surfaces, settings, location, status, cost_usd, completed_at)
    VALUES (${AUDIT_ID}, ${ORG_ID}, ARRAY['google_ai_overviews', 'google_ai_mode']::text[],
      ${sql.json({ aiOverviewsEnabled: false, aiModeEnabled: false, countInHeadline: false, queueMode: "standard", device: "desktop", maxCostUsdPerAudit: 0.1, provider: "dataforseo", decisions: {} })},
      ${sql.json({ code: 9071744, label: "2153 NSW", kind: "postcode", precise: true, note: null })},
      'complete', 0.0096, now())
  `;
  for (const [surface, prefix] of [
    ["google_ai_overviews", "aio"],
    ["google_ai_mode", "aim"],
  ] as const) {
    for (const [i, q] of QUESTIONS.entries()) {
      const answer = parseDataForSeoResult(
        fixture(`${prefix}-task-get-${q}.json`).tasks[0].result[0],
      );
      // The two questions that name Omega: verified by its own cited site (the integration test's result).
      const branded = q === "q11" || q === "q13";
      await sql`
        INSERT INTO google_surface_results (audit_id, organization_id, surface, prompt, prompt_index,
          is_branded_prompt, outcome, provider, attempts, answer_text, cited_links, google_link_count,
          brand_mentioned, mention_verification, cost_usd, cost_source, location_code, location_label,
          device, se_domain, language_code, queue_mode, fetched_at)
        VALUES (${AUDIT_ID}, ${ORG_ID}, ${surface}, ${questions[i]}, ${i}, ${branded},
          ${answer.shown ? "shown" : "not_shown"}, 'dataforseo', 1, ${answer.answerText},
          ${sql.json(answer.citedLinks)}, ${answer.citedLinks.filter((l) => l.googleLink).length},
          ${answer.shown ? branded : null}, ${answer.shown && branded ? "verified_domain" : null}, 0.0012,
          'provider_reported', 9071744, '2153 NSW', 'desktop', ${answer.seDomain}, 'en', 'standard', now())
      `;
    }
  }
});

test.afterAll(async () => {
  await deleteOrg();
  await deleteOperator();
  await sql.end();
});

async function signIn(page: Page) {
  const res = await page.request.post("/api/auth/sign-in/email", {
    data: { email: EMAIL, password: PASSWORD },
    headers: { origin: BASE },
  });
  expect(res.ok(), `sign-in: ${res.status()}`).toBe(true);
}

async function fits(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "no sideways scroll").toBeLessThanOrEqual(1);
}

// 13 Nov (part 11): one Save round trip on /admin/settings, on this spec's own brand (nothing global):
// "Saving…" while it's sent, "Saved", the value in force after a reload and in Changes; then the unchanged
// case -- another operator saved the same value first, so the server says "No change".
test("the operator's Save: Saving…, Saved, kept after a reload; No change when it was already saved", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/admin/settings?workspace=${ORG_ID}`);
  const field = page.locator(`[data-admin-field="postcode-${BRAND_ID}"]`);
  const input = field.getByLabel("Postcode for Omega Services");
  const save = field.getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();
  await input.fill("2153");

  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/settings", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  await save.click();
  await expect(field.getByRole("button", { name: "Saving…" })).toBeDisabled();
  release();
  await expect(field.getByRole("status")).toHaveText("Saved");
  await page.unroute("**/api/admin/settings");

  await page.reload();
  await expect(input).toHaveValue("2153");
  await expect(page.locator("[data-admin-history]")).toContainText("2153");

  await input.fill("2154");
  await sql`UPDATE brand_google_locations SET postcode = '2154' WHERE brand_id = ${BRAND_ID}`;
  await save.click();
  await expect(field.getByRole("status")).toHaveText("No change: that was already the value");
  await sql`DELETE FROM brand_google_locations WHERE brand_id = ${BRAND_ID}`;
});

for (const width of [375, 1280] as const) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 375 ? 812 : 900 } });

    test("the audit page's Google Search AI block", async ({ page }) => {
      await signIn(page);
      await page.goto(`/audits/${AUDIT_ID}`);
      const block = page.locator("[data-google-search-ai]");
      await expect(block).toBeVisible();
      await expect(block).toContainText("Google Search AI");
      await expect(block).toContainText("2153 NSW · desktop");
      await expect(block).toContainText("AI Overviews: shown for 3 of 4 questions");
      await expect(block).toContainText("AI Mode: answered 4 of 4");
      await expect(block).toContainText("Not counted in the Visibility % above");
      await block.locator("summary").click();
      await expect(block.locator("[data-google-question]")).toHaveCount(4);
      await fits(page);
    });

    test("the operator's /admin/settings", async ({ page }) => {
      await signIn(page);
      await page.goto(`/admin/settings?workspace=${ORG_ID}`);
      await expect(page.locator("[data-admin-settings]")).toBeVisible();
      await expect(page.locator("[data-admin-env]")).toContainText("GOOGLE_AI_SURFACES_ENABLED");
      await expect(page.locator("[data-admin-global]")).toContainText(
        "Count Google in the headline",
      );
      const selected = page.locator(`[data-admin-selected="${ORG_ID}"]`);
      await expect(selected).toContainText("Plan: Growth");
      await expect(selected.locator("[data-admin-surface]")).toHaveCount(2);
      await expect(page.locator(`[data-admin-brand="${BRAND_ID}"]`)).toContainText(
        "Omega Services",
      );
      await fits(page);
    });
  });
}
