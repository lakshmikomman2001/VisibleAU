/**
 * Audit #36 follow-up, item 4 -- the audit page is never wider than the
 * screen: finished, running and failed, at 320, 375 and 1280px.
 *
 * Renders the real page components from a real (test) database, then
 * loads the HTML into headless Chromium (Playwright) and checks
 * document.documentElement.scrollWidth <= innerWidth. The pages style
 * themselves inline, so the only CSS added is Tailwind's reset (what
 * app/globals.css's preflight applies in the app) and the colour tokens.
 * The app shell (sidebar, top bar) is not part of this check.
 *
 * Set AUDIT_WIDTH_SCREENSHOTS to a directory to also save a full-page
 * screenshot of each case there.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium } from "@playwright/test";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const FINISHED_AUDIT = randomUUID();
const RUNNING_AUDIT = randomUUID();
const FAILED_AUDIT = randomUUID();

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"];
const WIDTHS = [320, 375, 1280];
// A long name and a long metadata line are the realistic worst case.
const BRAND_NAME = "Omega Services Plumbing & Gas Fitting";

const RANKED_MENTION =
  "Good local options:\n1. Alpha Plumbing\n2. Beta Plumbing\n3. Gamma Plumbing\n4. Omega Services Plumbing & Gas Fitting, fast call-outs.\n5. Delta Plumbing";
const NO_MENTION = "Good local options: Alpha Plumbing, Beta Plumbing and Gamma Plumbing.";

const RESET_CSS = `
*,::after,::before,::backdrop{box-sizing:border-box;border:0 solid;margin:0;padding:0}
html{line-height:1.5;-webkit-text-size-adjust:100%;font-family:ui-sans-serif,system-ui,sans-serif}
h1,h2,h3,h4{font-size:inherit;font-weight:inherit}
a{color:inherit;text-decoration:inherit}
img,svg{display:block;max-width:100%;height:auto}
:root{--bg-base:#f6f7f9;--bg-elevated:#fff;--border-default:#e2e4ea;--border-subtle:#eceef2;
--text-primary:#14161b;--text-secondary:#4b5160;--text-tertiary:#7a8091;--success:#1f9d55;
--success-soft:#e6f6ec;--warning:#c27803;--warning-soft:#fdf3e1;--danger:#d64545;--danger-soft:#fdeaea;
--accent-blue:#2563eb;--accent-muted:#eef0f4;--font-mono:ui-monospace,Menlo,Consolas,monospace}
body{background:var(--bg-base)}`;

let client: ReturnType<typeof postgres>;
let browser: Browser;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`phone-width-${ORG_ID}`}, 'Phone Width Test Org', ${`phone-width-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${BRAND_ID}, ${ORG_ID}, ${BRAND_NAME}, 'omegaservicesplumbing.example.com.au', 'tradies', 'au',
      ARRAY[]::text[], ${client.json(["q"])}, ${PROMPT_GENERATOR_VERSION}, 'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at, failed_at, metadata)
    VALUES
      (${FINISHED_AUDIT}, ${BRAND_ID}, ${ORG_ID}, 36, 'manual', 'complete', ${ENGINES}, 4, 13, 1, 52, now() - interval '9 minutes', now(), NULL, '{}'),
      (${RUNNING_AUDIT}, ${BRAND_ID}, ${ORG_ID}, 37, 'manual', 'running', ${ENGINES}, 4, 13, 1, 52, now() - interval '2 minutes', NULL, NULL, '{}'),
      (${FAILED_AUDIT}, ${BRAND_ID}, ${ORG_ID}, 38, 'manual', 'failed', ${ENGINES}, 4, 13, 1, 52, now() - interval '5 minutes', NULL, now(),
        ${client.json({ error: "Every engine call failed: the provider rejected the request (invalid_request_error) for each of the 52 planned answers." })})
  `;
  for (const auditId of [FINISHED_AUDIT, RUNNING_AUDIT]) {
    for (const engine of ENGINES) {
      for (let index = 0; index < (auditId === RUNNING_AUDIT ? 4 : 10); index++) {
        const mentioned = index === 0 && engine !== "claude";
        const text = mentioned ? RANKED_MENTION : NO_MENTION;
        await client`
          INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt, mention_verification, sentiment_label, context_label, response_text, response_snippet, cited_sources, llm_model, llm_cost_usd)
          VALUES (${auditId}, ${engine}, ${`Who is a reliable plumber near Bondi Junction? (${index})`}, ${index}, 1, ${mentioned}, false,
            ${mentioned ? "verified_location" : null}, 'neutral', 'absent', ${text}, ${text.slice(0, 500)},
            ${client.json(mentioned ? [{ url: "https://hipages.com.au/connect/omegaservicesplumbingandgasfitting/service/123456", domain: "hipages.com.au" }] : [])},
            'test-model', '0.010000')
        `;
      }
    }
  }
  await client`
    INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts, latency_ms, cost_usd)
    VALUES (${FINISHED_AUDIT}, ${ORG_ID}, 'claude', 'Is Omega Services popular in Bondi?', 12, true, 'other', 'Bad request', 1, 1100, '0')
  `;

  browser = await chromium.launch();
}, 120000);

afterAll(async () => {
  await browser?.close();
  await client`DELETE FROM engine_call_failures WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM citations WHERE audit_id IN (${FINISHED_AUDIT}, ${RUNNING_AUDIT}, ${FAILED_AUDIT})`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function renderAuditPage(auditId: string): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  const element = await AuditPage({
    params: Promise.resolve({ auditId }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(element);
}

async function measure(html: string, width: number, screenshotName: string) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${RESET_CSS}</style></head><body>${html}</body></html>`,
    );
    const dir = process.env.AUDIT_WIDTH_SCREENSHOTS;
    if (dir) {
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: join(dir, `${screenshotName}-${width}.png`), fullPage: true });
    }
    return await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
  } finally {
    await page.close();
  }
}

describe("item 4 -- nothing on the audit page is wider than the screen", () => {
  for (const [label, auditId] of [
    ["finished", FINISHED_AUDIT],
    ["running", RUNNING_AUDIT],
    ["failed", FAILED_AUDIT],
  ] as const) {
    it(`${label} audit: scrollWidth <= innerWidth at ${WIDTHS.join(", ")}px`, async () => {
      const html = await renderAuditPage(auditId);
      for (const width of WIDTHS) {
        const { scrollWidth, innerWidth } = await measure(html, width, `audit-${label}`);
        expect(innerWidth).toBe(width);
        expect(scrollWidth, `${label} at ${width}px`).toBeLessThanOrEqual(innerWidth);
      }
    }, 60000);
  }
});
