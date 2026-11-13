/**
 * Part 14 (Sri, 13 Nov): what Vunnara pays its providers is for operators only, and only on /admin.
 * Real DB, real routes and pages: a customer's API responses and pages carry no cost at all (not even a
 * hidden field), a failed audit stopped by the daily limit reads without its amounts, and the operator's
 * /admin/costs has every audit's cost with Google's DataForSEO cost in the totals; anyone else gets 403.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const CAPPED_AUDIT_ID = randomUUID();
const ORG_NAME = `Costs Operator Only ${ORG_ID.slice(0, 8)}`;
const operatorState = { allowed: false };

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({
    id: "costs-operator-only-user",
    organizationId: ORG_ID,
    organization: { id: ORG_ID, metadata: {} },
  }),
}));
vi.mock("@/lib/auth/platform-admin", () => ({
  checkPlatformAdmin: vi.fn(async () => ({ allowed: operatorState.allowed, userId: "u-1" })),
  isPlatformAdmin: vi.fn(async () => operatorState.allowed),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`costs-op-${ORG_ID}`}, ${ORG_NAME}, ${`costs-op-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Costs Plumbing', 'costsplumbing.example.com.au', 'tradies', 'au', ARRAY[]::text[], 'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at, total_cost_usd, metadata)
    VALUES
      (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'complete', ${["chatgpt", "perplexity"]}, 2, 3, 1, 6, now(), now(), '0.4700', ${client.json({})}),
      (${CAPPED_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 2, 'failed', ${["chatgpt"]}, 1, 3, 1, 3, now(), null, null,
        ${client.json({ error: "Daily spending limit reached (A$4.20 of A$5.00); audits resume after midnight (Sydney time).", errorCode: "DailySpendCapExceededError" })})
  `;
  // US$0.12 + US$0.30 answered, US$0.05 billed on a failed ChatGPT call.
  await client`
    INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, sentiment_label, context_label, response_snippet, llm_cost_usd, llm_cost_source)
    VALUES
      (${AUDIT_ID}, 'chatgpt', 'p1', 0, 1, false, 'neutral', 'absent', 'An answer.', '0.120000', 'provider_reported'),
      (${AUDIT_ID}, 'perplexity', 'p2', 1, 1, false, 'neutral', 'absent', 'An answer.', '0.300000', 'price_table')
  `;
  await client`
    INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts, latency_ms, cost_usd)
    VALUES (${AUDIT_ID}, ${ORG_ID}, 'chatgpt', 'p3', 2, false, 'search_tool_error', 'tool failed', 1, 1000, '0.05')
  `;
  // Google: two DataForSEO tasks at US$0.0048 each.
  await client`
    INSERT INTO audit_google_surfaces (audit_id, organization_id, surfaces, settings, location, status, cost_usd, completed_at)
    VALUES (${AUDIT_ID}, ${ORG_ID}, ARRAY['google_ai_overviews', 'google_ai_mode']::text[],
      ${client.json({ aiOverviewsEnabled: true, aiModeEnabled: true, countInHeadline: false, queueMode: "standard", device: "desktop", maxCostUsdPerAudit: 0.1, provider: "dataforseo", decisions: {} })},
      ${client.json({ code: 9071744, label: "2153 NSW", kind: "postcode", precise: true, note: null })},
      'complete', 0.0096, now())
  `;
  for (const surface of ["google_ai_overviews", "google_ai_mode"]) {
    await client`
      INSERT INTO google_surface_results (audit_id, organization_id, surface, prompt, prompt_index,
        is_branded_prompt, outcome, provider, attempts, answer_text, cited_links, google_link_count,
        brand_mentioned, mention_verification, cost_usd, cost_source, location_code, location_label,
        device, se_domain, language_code, queue_mode, fetched_at)
      VALUES (${AUDIT_ID}, ${ORG_ID}, ${surface}, 'Best plumber near me?', 0, false, 'not_shown', 'dataforseo', 1,
        null, ${client.json([])}, 0, null, null, 0.0048, 'provider_reported', 9071744, '2153 NSW', 'desktop',
        'google.com.au', 'en', 'standard', now())
    `;
  }
}, 30_000);

afterAll(async () => {
  await client`DELETE FROM google_surface_results WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM audit_google_surfaces WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM audit_exports WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM engine_call_failures WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ${ORG_ID})`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

/** Every key anywhere in a JSON value. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
  }
  return [];
}
const COST_KEY = /cost|spend|price/i;
const params = (auditId: string) => ({ params: Promise.resolve({ auditId }) });

describe("a customer's API responses carry no cost, not even hidden", () => {
  it("the audit's status, full and Google routes", async () => {
    const status = await (await import("@/app/api/audits/[auditId]/route")).GET(
      new Request(`http://test/api/audits/${AUDIT_ID}`),
      params(AUDIT_ID),
    );
    const full = await (await import("@/app/api/audits/[auditId]/full/route")).GET(
      new Request(`http://test/api/audits/${AUDIT_ID}/full`),
      params(AUDIT_ID),
    );
    const google = await (await import("@/app/api/audits/[auditId]/google-surfaces/route")).GET(
      new Request(`http://test/api/audits/${AUDIT_ID}/google-surfaces`),
      params(AUDIT_ID),
    );
    for (const res of [status, full, google]) {
      expect(res.status).toBe(200);
      const keys = keysOf(await res.json());
      expect(keys.length).toBeGreaterThan(3);
      expect(keys.filter((k) => COST_KEY.test(k))).toEqual([]);
    }
  });

  it("the JSON export sends the stored rows without their cost columns", async () => {
    const { GET } = await import("@/app/api/audits/[auditId]/export/route");
    const res = await GET(
      new Request(`http://test/api/audits/${AUDIT_ID}/export`),
      params(AUDIT_ID),
    );
    const body = JSON.parse(await res.text());
    expect(body.citations).toHaveLength(2);
    expect(body.googleSurfaces).toHaveLength(2);
    expect(keysOf(body).filter((k) => COST_KEY.test(k))).toEqual([]);
  });

  it("the CSV export has no cost columns", async () => {
    const { GET } = await import("@/app/api/audits/[auditId]/export/route");
    const res = await GET(
      new Request(`http://test/api/audits/${AUDIT_ID}/export?format=csv`),
      params(AUDIT_ID),
    );
    const [header, ...rows] = (await res.text()).split("\n");
    expect(header).toBe(
      "audit_number,brand_name,engine,prompt,run_number,brand_mentioned,position,sentiment_label,context_label,response_snippet,cited_sources_domains,llm_model,created_at",
    );
    expect(rows).toHaveLength(4);
    expect(rows.join("\n")).not.toMatch(/0\.0048|0\.12|0\.3\b/);
  });

  it("an audit the daily limit stopped says so, without the amounts", async () => {
    const { DAILY_LIMIT_CUSTOMER_MESSAGE } = await import("@/lib/costs/customer-safe");
    const res = await (await import("@/app/api/audits/[auditId]/route")).GET(
      new Request(`http://test/api/audits/${CAPPED_AUDIT_ID}`),
      params(CAPPED_AUDIT_ID),
    );
    const body = await res.json();
    expect(body.audit.metadata.error).toBe(DAILY_LIMIT_CUSTOMER_MESSAGE);
    expect(JSON.stringify(body)).not.toContain("A$");
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const html = renderToStaticMarkup(
      await AuditPage({
        params: Promise.resolve({ auditId: CAPPED_AUDIT_ID }),
        searchParams: Promise.resolve({}),
      }),
    ).replace(/&#x27;/g, "'");
    expect(html).toContain(DAILY_LIMIT_CUSTOMER_MESSAGE);
    expect(html).not.toContain("A$");
  });
});

describe("the customer's pages show no cost", () => {
  it("the finished audit and the audits list", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const audit = renderToStaticMarkup(
      await AuditPage({
        params: Promise.resolve({ auditId: AUDIT_ID }),
        searchParams: Promise.resolve({}),
      }),
    );
    const AuditsPage = (await import("@/app/(auth)/audits/page")).default;
    const list = renderToStaticMarkup(await AuditsPage({ searchParams: Promise.resolve({}) }));
    expect(audit).toContain("Audit #1");
    expect(list).toContain("#1");
    for (const html of [audit, list]) {
      expect(html).not.toMatch(/A\$\d|US\$\d/);
      expect(html).not.toMatch(/Provider usage|Cost so far|>Cost</);
    }
  });
});

describe("the operator's /admin/costs", () => {
  it("anyone else gets 403 from the API and Forbidden from the page, and none of the figures", async () => {
    operatorState.allowed = false;
    const res = await (await import("@/app/api/admin/costs/route")).GET();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    const AdminCostsPage = (await import("@/app/(auth)/admin/costs/page")).default;
    const html = renderToStaticMarkup(await AdminCostsPage());
    expect(html).toContain("Forbidden");
    expect(html).not.toContain(ORG_NAME);
    expect(html).not.toContain("A$");
  });

  it("the operator sees each audit's cost by engine, with Google's DataForSEO cost in the totals", async () => {
    operatorState.allowed = true;
    const res = await (await import("@/app/api/admin/costs/route")).GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const ws = body.workspaces.find((w: { organizationId: string }) => w.organizationId === ORG_ID);
    expect(ws.name).toBe(ORG_NAME);
    expect(ws.plan).toBe("Free");
    expect(
      ws.byEngine.map((e: { name: string; usd: number }) => [e.name, Number(e.usd.toFixed(4))]),
    ).toEqual([
      ["ChatGPT", 0.17],
      ["Perplexity", 0.3],
    ]);
    expect(ws.googleUsd).toBeCloseTo(0.0096, 6);
    expect(ws.totalUsd).toBeCloseTo(0.4796, 6);
    const audit = ws.audits.find((a: { auditId: string }) => a.auditId === AUDIT_ID);
    expect(audit.googleUsd).toBeCloseTo(0.0096, 6);
    expect(audit.totalUsd).toBeCloseTo(0.4796, 6);
    expect(body.googleUsd).toBeGreaterThanOrEqual(0.0096);

    const AdminCostsPage = (await import("@/app/(auth)/admin/costs/page")).default;
    const html = renderToStaticMarkup(await AdminCostsPage()).replace(/<!-- -->/g, "");
    expect(html).toContain(ORG_NAME);
    // 13 Nov, part 1: through the GST switch (off) and formatAud, never "A$0.00 a month incl. GST".
    expect(html).toContain("Free plan · A$0 a month</p>");
    const section = html.slice(html.indexOf(`data-admin-cost-workspace="${ORG_ID}"`));
    expect(section).toMatch(/data-admin-cost-google="">A\$0\.01 · US\$0\.01/);
    expect(section).toMatch(/data-admin-cost-total="">A\$0\.7\d · US\$0\.48/);
  });
});
