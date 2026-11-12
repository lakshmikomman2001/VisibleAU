/**
 * "Cost honesty" (25 Oct), items 1-2 -- real DB, real pages, real inline runner.
 *
 * Part 14 (Sri, 13 Nov): what the calls cost us is for operators only, on /admin/costs. The same honesty
 * (measured per call, follow-ups apart, an unpriced call never a silent $0) is checked on the operator's
 * figures (lib/admin/costs.ts); the customer's pages and poll carry no cost at all.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Engine } from "@/lib/llm/interface";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const PRICED_AUDIT = randomUUID();
const UNPRICED_RUNNING_AUDIT = randomUUID();
const RUNNER_AUDIT = randomUUID();
const UNPRICED_MODEL = "model-without-a-price";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// Every engine answers from a model the price table doesn't know, priced through the real callCost.
vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  const { callCost } = await import("@/lib/audit/compute-cost");
  return {
    ...actual,
    getLLMService: (engine: Engine = "chatgpt") => ({
      complete: async () => {
        const cost = callCost(engine, UNPRICED_MODEL, 1000, 500);
        return {
          response: "A plain answer that names no business at all.",
          model: UNPRICED_MODEL,
          tokensUsed: 1500,
          costEstimateUsd: cost.usd,
          capReserveUsd: cost.capReserveUsd,
          isCacheHit: false,
        };
      },
    }),
  };
});

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`cost-honesty-${ORG_ID}`}, 'Cost Honesty Test Org', ${`cost-honesty-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Cost Honesty Plumbing', 'costhonesty.example.com.au', 'tradies', 'au',
      ARRAY[]::text[],
      ${client.json(Array.from({ length: 3 }, (_, i) => `Organic test prompt ${i + 1} about plumbing`))},
      ${PROMPT_GENERATOR_VERSION},
      'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at)
    VALUES
      (${PRICED_AUDIT}, ${BRAND_ID}, ${ORG_ID}, 1, 'running', ${["chatgpt", "perplexity"]}, 2, 3, 1, 6, now()),
      (${UNPRICED_RUNNING_AUDIT}, ${BRAND_ID}, ${ORG_ID}, 2, 'running', ${["chatgpt", "perplexity"]}, 2, 3, 1, 6, now())
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status)
    VALUES (${RUNNER_AUDIT}, ${BRAND_ID}, ${ORG_ID}, 3, 'manual', 'pending')
  `;
  // Priced: US$0.12 + US$0.30 answered, US$0.05 billed on a failed call = US$0.47.
  await client`
    INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, sentiment_label, context_label, llm_cost_usd)
    VALUES
      (${PRICED_AUDIT}, 'chatgpt', 'p1', 0, 1, false, 'neutral', 'absent', '0.120000'),
      (${PRICED_AUDIT}, 'perplexity', 'p2', 1, 1, false, 'neutral', 'absent', '0.300000'),
      (${UNPRICED_RUNNING_AUDIT}, 'chatgpt', 'p1', 0, 1, false, 'neutral', 'absent', NULL)
  `;
  await client`
    INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts, latency_ms, cost_usd)
    VALUES (${PRICED_AUDIT}, ${ORG_ID}, 'chatgpt', 'p3', 2, false, 'search_tool_error', 'tool failed', 1, 1000, '0.05')
  `;
}, 30000);

afterAll(async () => {
  await client`DELETE FROM action_items WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM audit_cost_snapshots WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM engine_call_failures WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ${ORG_ID})`;
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

async function renderAuditsList(): Promise<string> {
  const AuditsPage = (await import("@/app/(auth)/audits/page")).default;
  return renderToStaticMarkup(await AuditsPage({ searchParams: Promise.resolve({}) }));
}

/** The operator's row for one of this file's audits (/admin/costs, lib/admin/costs.ts). */
async function operatorAudit(auditId: string) {
  const { loadOperatorCosts } = await import("@/lib/admin/costs");
  const costs = await loadOperatorCosts();
  const ws = costs.workspaces.find((w) => w.organizationId === ORG_ID);
  return ws?.audits.find((a) => a.auditId === auditId);
}

/** Part 14 (Sri, 13 Nov): no figure a customer reads is what the calls cost us. */
function expectNoCost(html: string) {
  expect(html).not.toMatch(/A\$\d|US\$\d|Cost incomplete|Provider usage|Cost so far/);
}

describe("item 1 -- the operator's figure is the calls' own measured cost; the customer sees none", () => {
  it("US$0.47 (A$0.72) from the answers and the failed call, follow-up spend kept separate", async () => {
    const { formatAudFromUsd } = await import("@/lib/constants/currency");
    expect(formatAudFromUsd(0.47)).toBe("A$0.72");
    expectNoCost(await renderAuditPage(PRICED_AUDIT));
    expect((await operatorAudit(PRICED_AUDIT))?.totalUsd).toBeCloseTo(0.47, 6);

    // Completion, then a follow-up competitor comparison recorded afterwards (record() also adds it to total_cost_usd).
    await client`
      UPDATE audits SET status = 'complete', completed_at = now(), total_cost_usd = '0.5200' WHERE id = ${PRICED_AUDIT}
    `;
    await client`
      INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale, actual_cost_cents, source)
      VALUES
        (${PRICED_AUDIT}, ${ORG_ID}, 'AU_EN', 'en-AU', 72, 'audit'),
        (${PRICED_AUDIT}, ${ORG_ID}, 'AU_EN', 'en-AU', 8, 'run-comparison-prompts')
    `;
    const finished = await operatorAudit(PRICED_AUDIT);
    // The calls' own costs, never total_cost_usd (which absorbed the follow-up); the follow-up apart.
    expect(finished?.totalUsd).toBeCloseTo(0.47, 6);
    expect(finished?.followUpAudCents).toBe(8);
    expect(finished?.incomplete).toBe(false);
    expect(finished?.engines.map((e) => [e.engine, Number(e.usd.toFixed(2))])).toEqual([
      ["chatgpt", 0.17],
      ["perplexity", 0.3],
    ]);
    expectNoCost((await renderAuditPage(PRICED_AUDIT)).replace(/<!-- -->/g, ""));
    expectNoCost(await renderAuditsList());
  });
});

describe("item 2 -- an unpriced call is never a silent $0", () => {
  it("a running audit with an unpriced answer is incomplete for the operator; the page and its poll carry no cost", async () => {
    expect((await operatorAudit(UNPRICED_RUNNING_AUDIT))?.incomplete).toBe(true);
    expectNoCost((await renderAuditPage(UNPRICED_RUNNING_AUDIT)).replace(/&#x27;/g, "'"));

    const { GET } = await import("@/app/api/audits/[auditId]/route");
    const res = await GET(new Request(`http://test/api/audits/${UNPRICED_RUNNING_AUDIT}`), {
      params: Promise.resolve({ auditId: UNPRICED_RUNNING_AUDIT }),
    });
    const body = await res.json();
    expect(body.costIncomplete).toBeUndefined();
    expect(body.costIncompleteNote).toBeUndefined();
    expect(body.costSoFarUsd).toBeUndefined();
  });

  it("through the real runner: logs cost_price_missing, stores no cost, reserves it for the cap, and only the operator sees it's incomplete", async () => {
    const { callCost } = await import("@/lib/audit/compute-cost");
    const { usdToAudCents } = await import("@/lib/constants/currency");
    const { DAILY_LIMIT_CUSTOMER_MESSAGE } = await import("@/lib/costs/customer-safe");
    const { BudgetPolicyService, DailySpendCapExceededError } = await import(
      "@/lib/platform/budget-policy.service"
    );
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");

    const error = vi.spyOn(console, "error");
    await runAuditInline(RUNNER_AUDIT);

    const [audit] = await client<{ status: string; total_cost_usd: string }[]>`
      SELECT status, total_cost_usd FROM audits WHERE id = ${RUNNER_AUDIT}
    `;
    expect(audit.status).toBe("complete");
    expect(Number(audit.total_cost_usd)).toBe(0);

    expect(error).toHaveBeenCalledWith(
      "[cost_price_missing]",
      JSON.stringify({ event: "cost_price_missing", model: UNPRICED_MODEL }),
    );
    error.mockRestore();

    const answers = await client<{ engine: string; llm_cost_usd: string | null }[]>`
      SELECT engine, llm_cost_usd FROM citations WHERE audit_id = ${RUNNER_AUDIT}
    `;
    expect(answers.length).toBe(6); // 3 questions x chatgpt + perplexity (free tier)
    expect(answers.every((a) => a.llm_cost_usd === null)).toBe(true);

    const expectedReserveUsd = answers.reduce(
      (sum, a) => sum + callCost(a.engine as Engine, UNPRICED_MODEL, 1000, 500).capReserveUsd,
      0,
    );
    const snapshots = await client<{ source: string; actual_cost_cents: number }[]>`
      SELECT source, actual_cost_cents FROM audit_cost_snapshots WHERE audit_id = ${RUNNER_AUDIT} ORDER BY source
    `;
    expect(snapshots).toEqual([
      { source: "audit", actual_cost_cents: 0 },
      { source: "audit:unpriced_reserve", actual_cost_cents: usdToAudCents(expectedReserveUsd) },
    ]);

    // The cap counts the reserve; the spend it reports never includes it. The customer's message has no
    // amounts (part 14); the operator's detail has them.
    const reserveCents = usdToAudCents(expectedReserveUsd);
    const atReserve = await BudgetPolicyService.checkDailySpend(ORG_ID, 80 + reserveCents);
    expect(atReserve.spentTodayCents).toBe(80);
    expect(atReserve.unpricedReserveCents).toBe(reserveCents);
    expect(atReserve.allowed).toBe(false);
    const capErr = new DailySpendCapExceededError(atReserve);
    expect(capErr.message).toBe(DAILY_LIMIT_CUSTOMER_MESSAGE);
    expect(capErr.operatorDetail).toBe(
      `Daily spending limit reached (A$0.80 of A$${((80 + reserveCents) / 100).toFixed(2)}, cost incomplete).`,
    );
    expect((await BudgetPolicyService.checkDailySpend(ORG_ID, 81 + reserveCents)).allowed).toBe(
      true,
    );

    const operator = await operatorAudit(RUNNER_AUDIT);
    expect(operator?.totalUsd).toBe(0);
    expect(operator?.incomplete).toBe(true);
    expectNoCost((await renderAuditPage(RUNNER_AUDIT)).replace(/<!-- -->/g, ""));
    expectNoCost(await renderAuditsList());
  });
});
