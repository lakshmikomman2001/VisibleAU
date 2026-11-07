/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 7 -- both audit runners store each answer's input and output
 * tokens as its provider reported them (citations.llm_input_tokens / llm_output_tokens, migration 0129), next
 * to the total; NULL when the provider reported none, never estimated. Real DB, the real runners
 * (lib/audit/run-audit-inline.ts and inngest/functions/run-audit.ts), a stubbed engine: ChatGPT reports its
 * usage, Perplexity reports none.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Engine } from "@/lib/llm/interface";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    getLLMService: (engine: Engine = "chatgpt") => ({
      complete: async () => ({
        response: "A plain answer that names no business at all.",
        model: engine === "chatgpt" ? "gpt-4.1-mini" : "sonar",
        tokensUsed: 1500,
        // ChatGPT's response carried its usage; Perplexity's carried none.
        ...(engine === "chatgpt" ? { inputTokens: 1200, outputTokens: 300 } : {}),
        costEstimateUsd: 0.001,
        costSource: "price_table" as const,
        isCacheHit: false,
      }),
    }),
  };
});

const step = {
  run: (_name: string, fn: () => unknown) => fn(),
  sendEvent: async () => ({ ids: [] }),
};

let client: ReturnType<typeof postgres>;
let nextAuditNumber = 1;

async function pendingAudit(): Promise<string> {
  const auditId = randomUUID();
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status)
    VALUES (${auditId}, ${BRAND_ID}, ${ORG_ID}, ${nextAuditNumber++}, 'manual', 'pending')
  `;
  return auditId;
}

async function storedTokens(auditId: string) {
  return client<{ engine: string; input: number | null; output: number | null }[]>`
    SELECT engine, llm_input_tokens AS input, llm_output_tokens AS output
    FROM citations WHERE audit_id = ${auditId} ORDER BY engine, prompt_index
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`token-counts-${ORG_ID}`}, 'Token Counts Test Org', ${`token-counts-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Token Counts Plumbing', 'tokencounts.example.com.au', 'tradies', 'au',
      ARRAY[]::text[],
      ${client.json(Array.from({ length: 2 }, (_, i) => `Organic test prompt ${i + 1} about plumbing`))},
      ${PROMPT_GENERATOR_VERSION},
      'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')
  `;
}, 30_000);

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

function expectStored(rows: Awaited<ReturnType<typeof storedTokens>>) {
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    if (row.engine === "chatgpt")
      expect(row, row.engine).toMatchObject({ input: 1200, output: 300 });
    else expect(row, row.engine).toMatchObject({ input: null, output: null });
  }
  expect(new Set(rows.map((r) => r.engine))).toEqual(new Set(["chatgpt", "perplexity"]));
}

describe("each answer's input and output tokens are stored as the provider reported them", () => {
  it("the inline runner: ChatGPT's counts, and NULL for Perplexity's unreported usage", async () => {
    const auditId = await pendingAudit();
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
    await runAuditInline(auditId);
    expectStored(await storedTokens(auditId));
  }, 60_000);

  it("the Inngest runner: the same", async () => {
    const auditId = await pendingAudit();
    const { runAudit } = await import("@/inngest/functions/run-audit");
    type Handler = (ctx: {
      event: { data: { auditId: string } };
      step: typeof step;
    }) => Promise<unknown>;
    await (runAudit as unknown as { fn: Handler }).fn({ event: { data: { auditId } }, step });
    expectStored(await storedTokens(auditId));
  }, 60_000);
});
