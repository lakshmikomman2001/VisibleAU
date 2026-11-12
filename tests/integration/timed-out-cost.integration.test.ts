/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 4 -- a timed-out call's cost is unknown, never $0: the provider
 * may have billed the search or the tokens it wrote before our abort. Its failure row stores NULL (migration
 * 0127), and the audit's cost says so: "Cost incomplete: 1 call timed out" -- on the audit page and in what the
 * running page polls -- not a total that silently counts the call as free. Real DB.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session } = vi.hoisted(() => ({ session: { organizationId: "" } }));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ organizationId: session.organizationId })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

const MENTIONS = { chatgpt: [1, 2], claude: [1], gemini: [2], perplexity: [1, 3] };

let client: ReturnType<typeof postgres>;
let fx: ReportFixture;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  fx = await seedReportFixture(client, {
    audits: [
      { number: 60, completedAt: "2026-11-30T23:00:00.000Z", mentions: MENTIONS },
      { number: 61, completedAt: "2026-12-01T23:00:00.000Z", mentions: MENTIONS },
      { number: 62, completedAt: "2026-12-02T23:00:00.000Z", mentions: MENTIONS },
    ],
  });
  session.organizationId = fx.orgId;
  // The fixture stores its answers with no cost; give them a priced one, so only what's below is unknown.
  await client`
    UPDATE citations SET llm_cost_usd = 0.001, llm_cost_source = 'price_table'
    WHERE audit_id IN (${fx.audits[60]}, ${fx.audits[61]}, ${fx.audits[62]})
  `;
  // #60: one Claude call timed out on both attempts -- its cost unknown, as the runners now record it.
  // #61: a call that failed before any response, nothing billed ($0, known).
  // #62: both, plus an answer whose model had no price (its cost NULL).
  const failure = (auditId: string, promptIndex: number, errorClass: string, cost: string | null) =>
    client`
      INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index,
                                        is_branded_prompt, error_class, attempts, latency_ms, cost_usd)
      VALUES (${auditId}, ${fx.orgId}, 'claude', 'A question that timed out', ${100 + promptIndex}, false,
              ${errorClass}, 2, 150812, ${cost})
    `;
  await failure(fx.audits[60], 0, "timeout", null);
  await failure(fx.audits[61], 0, "other", "0");
  await failure(fx.audits[62], 0, "timeout", null);
  await failure(fx.audits[62], 1, "timeout", null);
  await client`
    UPDATE citations SET llm_cost_usd = NULL
    WHERE id = (SELECT id FROM citations WHERE audit_id = ${fx.audits[62]} LIMIT 1)
  `;
}, 120_000);

afterAll(async () => {
  await fx.cleanup();
  await client.end();
});

describe("a timed-out call's cost is unknown, and the audit's cost says so", () => {
  it("the failure row holds NULL: unknown, never $0", async () => {
    const [row] = await client`
      SELECT cost_usd FROM engine_call_failures WHERE audit_id = ${fx.audits[60]}
    `;
    expect(row.cost_usd).toBeNull();
  });

  it("the audit's cost: incomplete, with how many calls timed out", async () => {
    const { serviceDb } = await import("@/db/client");
    const { getAuditCosts } = await import("@/lib/audit/answered-count");
    const { costIncompleteNote } = await import("@/lib/constants/currency");
    const costs = await getAuditCosts(serviceDb, [fx.audits[60], fx.audits[61], fx.audits[62]]);

    const timedOut = costs.get(fx.audits[60]);
    expect(timedOut).toMatchObject({ incomplete: true, timedOutCalls: 1, otherUnknown: false });
    expect(timedOut && costIncompleteNote(timedOut)).toBe("Cost incomplete: 1 call timed out");

    // A call that failed before any response cost nothing: known, complete.
    const nothingBilled = costs.get(fx.audits[61]);
    expect(nothingBilled).toMatchObject({ incomplete: false, timedOutCalls: 0 });
    expect(nothingBilled && costIncompleteNote(nothingBilled)).toBeNull();

    const both = costs.get(fx.audits[62]);
    expect(both).toMatchObject({ incomplete: true, timedOutCalls: 2, otherUnknown: true });
    expect(both && costIncompleteNote(both)).toBe(
      "Cost incomplete: 2 calls timed out, and some calls' cost is unknown",
    );
  });

  // Part 14 (Sri, 13 Nov): the cost and its "incomplete" note are for operators only -- /admin/costs reads
  // getAuditCosts above and marks the audit's total "+"; the customer's audit page shows neither.
  it("the customer's audit page shows no cost and no cost note", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const html = renderToStaticMarkup(
      await AuditPage({
        params: Promise.resolve({ auditId: fx.audits[60] }),
        searchParams: Promise.resolve({}),
      }),
    )
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
    expect(html).toContain(`Audit #`);
    expect(html).not.toContain("Cost incomplete");
    expect(html).not.toMatch(/A\$\d/);
  }, 60_000);
});
