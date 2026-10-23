/**
 * "The Running audit page shows made-up numbers" (23 Oct), item 3 --
 * real-DB proof, matching the task's own "13 x 4 at 20/52" example:
 * Omega-shaped audit (13 prompts, 4 engines, 52 total calls, 20
 * answered -- 18 citations + 2 failures, to prove failure rows count
 * toward progress too).
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
// A second, OLDER complete audit with the SAME totalCalls (52), so
// getTypicalDurationMinutes has real history to find.
const HISTORY_AUDIT_ID = randomUUID();
// A third org/brand/audit with NO history at this answer count, to
// prove the estimate shows nothing rather than a guess.
const NO_HISTORY_ORG_ID = randomUUID();
const NO_HISTORY_BRAND_ID = randomUUID();
const NO_HISTORY_AUDIT_ID = randomUUID();

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`honest-numbers-${ORG_ID}`}, 'Honest Numbers Test Org', ${`honest-numbers-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Omega Services', 'omegaservices.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;
  // The running audit: 13 questions x 4 engines x 1 run = 52 answers,
  // 18 citations + 2 failures = 20 answered so far.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 35, 'running', ${["chatgpt", "claude", "gemini", "perplexity"]}, 4, 13, 1, 52, now())
  `;
  const citationRows: Array<[string, number]> = [
    ["chatgpt", 7],
    ["claude", 5],
    ["gemini", 4],
    ["perplexity", 2],
  ];
  for (const [engine, n] of citationRows) {
    for (let i = 0; i < n; i++) {
      await client`
        INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, sentiment_label, context_label)
        VALUES (${AUDIT_ID}, ${engine}, ${`prompt ${engine} ${i}`}, ${i}, 1, false, 'neutral', 'absent')
      `;
    }
  }
  // 2 failures, both chatgpt -- chatgpt's own done = 7 + 2 = 9.
  for (let i = 0; i < 2; i++) {
    await client`
      INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts, latency_ms, cost_usd)
      VALUES (${AUDIT_ID}, ${ORG_ID}, 'chatgpt', ${`failed prompt ${i}`}, ${100 + i}, false, 'timeout', 'timed out', 1, 1000, '0')
    `;
  }

  // History audit -- same org, same totalCalls (52), complete,
  // 12-minute duration, so the running audit's estimate has one real
  // data point to find.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at)
    VALUES (${HISTORY_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 30, 'complete', ${["chatgpt", "claude", "gemini", "perplexity"]}, 4, 13, 1, 52, '2026-10-01T00:00:00Z', '2026-10-01T00:12:00Z')
  `;

  // A second org/brand with no completed audits at this answer count.
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${NO_HISTORY_ORG_ID}, ${`no-history-${NO_HISTORY_ORG_ID}`}, 'No History Test Org', ${`no-history-org-${NO_HISTORY_ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${NO_HISTORY_BRAND_ID}, ${NO_HISTORY_ORG_ID}, 'No History Co', 'nohistoryco.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at)
    VALUES (${NO_HISTORY_AUDIT_ID}, ${NO_HISTORY_BRAND_ID}, ${NO_HISTORY_ORG_ID}, 1, 'running', ${["chatgpt", "claude", "gemini", "perplexity"]}, 4, 13, 1, 52, now())
  `;
}, 30000);

afterAll(async () => {
  await client`DELETE FROM engine_call_failures WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id IN (${AUDIT_ID}, ${HISTORY_AUDIT_ID}, ${NO_HISTORY_AUDIT_ID})`;
  await client`DELETE FROM brands WHERE id IN (${BRAND_ID}, ${NO_HISTORY_BRAND_ID})`;
  await client`DELETE FROM organizations WHERE id IN (${ORG_ID}, ${NO_HISTORY_ORG_ID})`;
  await client.end();
});

describe("Audit page -- running view, honest numbers (23 Oct, item 3)", () => {
  it("shows the real 13 questions x 4 engines = 52 answers header, with the real typical-duration estimate, no 'runs'/'composite'/fixed guess", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const element = await AuditPage({
      params: Promise.resolve({ auditId: AUDIT_ID }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("13 question");
    expect(html).toContain("4 engine");
    expect(html).toContain("52 answers");
    expect(html).toContain("Usually about 12 minutes");
    expect(html).not.toContain("runs");
    expect(html).not.toContain("composite");
    expect(html).not.toContain("Estimated");
    // The 7-step checklist's own step-3 label: real received/planned,
    // never the old "/0".
    expect(html).toContain("(20/52 answers)");
  });

  it("sets the breadcrumb to 'Audit #35' and the brand switcher to Omega's own brandId, not the generic defaults", async () => {
    const { SetBreadcrumbs } = await import("@/components/domain/set-breadcrumbs");
    const { SetCurrentBrand } = await import("@/components/domain/set-current-brand");
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const element = await AuditPage({
      params: Promise.resolve({ auditId: AUDIT_ID }),
      searchParams: Promise.resolve({}),
    });

    const children = (element as { props: { children: unknown } }).props.children as Array<{
      type: unknown;
      props: Record<string, unknown>;
    }>;
    const breadcrumbs = children.find((c) => c?.type === SetBreadcrumbs);
    const currentBrand = children.find((c) => c?.type === SetCurrentBrand);

    expect(breadcrumbs?.props.crumbs).toEqual(["Workspace", "Audits", "Audit #35"]);
    expect(currentBrand?.props.brandId).toBe(BRAND_ID);
  });

  it("estimate appears only when the org has real history at this exact answer count", async () => {
    const { getTypicalDurationMinutes } = await import("@/lib/audit/typical-duration");
    const { withRlsContext } = await import("@/db/client");

    const withHistory = await withRlsContext(ORG_ID, (tx) =>
      getTypicalDurationMinutes(tx, ORG_ID, 52),
    );
    expect(withHistory).toBe(12);

    const withoutHistory = await withRlsContext(NO_HISTORY_ORG_ID, (tx) =>
      getTypicalDurationMinutes(tx, NO_HISTORY_ORG_ID, 52),
    );
    expect(withoutHistory).toBeNull();
  });
});

describe("GET /api/audits/[auditId] -- real per-engine progress, failures counted (23 Oct, item 2)", () => {
  it("answeredCount includes failure rows, and each engine's per-engine total is the real promptsCount, never 0", async () => {
    const { GET } = await import("@/app/api/audits/[auditId]/route");
    const res = await GET(new Request(`http://test/api/audits/${AUDIT_ID}`), {
      params: Promise.resolve({ auditId: AUDIT_ID }),
    });
    const body = await res.json();

    // 18 citations + 2 failures.
    expect(body.answeredCount).toBe(20);

    const byEngine = new Map(
      (body.engineProgress as Array<{ engine: string; done: number; total: number }>).map((e) => [
        e.engine,
        e,
      ]),
    );
    expect(byEngine.get("chatgpt")).toEqual({ engine: "chatgpt", done: 9, total: 13 });
    expect(byEngine.get("claude")).toEqual({ engine: "claude", done: 5, total: 13 });
    expect(byEngine.get("gemini")).toEqual({ engine: "gemini", done: 4, total: 13 });
    expect(byEngine.get("perplexity")).toEqual({ engine: "perplexity", done: 2, total: 13 });
  });
});
