/**
 * "Record costs from what each provider actually reports" (6 Nov), item 1 -- real DB, both real
 * runners, the real PerplexityImpl. Perplexity's HTTP answer is stubbed with the usage shape one real
 * call returned on 6 Nov (usage.cost.total_cost); ChatGPT answers through the price table. Each row
 * records its cost and where it came from (migration 0120).
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
const INLINE_BRAND = randomUUID();
const INNGEST_BRAND = randomUUID();
const INLINE_AUDIT = randomUUID();
const INNGEST_AUDIT = randomUUID();
const MARKER = `provider-cost-${ORG_ID.slice(0, 8)}`;
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
const TOTAL_COST = 0.00462;

// ChatGPT through the price table, exactly as OpenAIImpl prices it; Perplexity is the real client.
vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  const { callCost } = await import("@/lib/audit/compute-cost");
  const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
  const perplexity = new PerplexityImpl();
  return {
    ...actual,
    getLLMService: (engine: Engine = "chatgpt") =>
      engine === "perplexity"
        ? perplexity
        : {
            complete: async () => {
              const cost = callCost(engine, "gpt-4.1-mini", 1000, 500);
              return {
                response: "A plain answer that names no business at all.",
                model: "gpt-4.1-mini",
                tokensUsed: 1500,
                costEstimateUsd: cost.usd,
                capReserveUsd: cost.capReserveUsd,
                costSource: cost.source,
                isCacheHit: false,
              };
            },
          },
  };
});

let client: ReturnType<typeof postgres>;
const realFetch = globalThis.fetch;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
  // Only Perplexity's endpoint is answered here: the second question gets a blank (billed) answer.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (urlOf(input) !== PERPLEXITY_URL) return realFetch(input, init);
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      messages: { content: string }[];
    };
    const blank = body.messages[0].content.includes("question two");
    return new Response(
      JSON.stringify({
        model: body.model,
        object: "chat.completion",
        choices: [
          { message: { content: blank ? "  " : "A plain answer that names no business at all." } },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 40,
          total_tokens: 52,
          search_context_size: "low",
          cost: {
            input_tokens_cost: 0.0021,
            output_tokens_cost: 0.00002,
            request_cost: 0.0025,
            total_cost: TOTAL_COST,
          },
        },
        citations: [],
        search_results: [],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`provider-cost-${ORG_ID}`}, 'Provider Cost Test Org', ${`provider-cost-org-${ORG_ID}`})
  `;
  for (const [brandId, runner] of [
    [INLINE_BRAND, "inline"],
    [INNGEST_BRAND, "inngest"],
  ] as const) {
    await client`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
      VALUES (${brandId}, ${ORG_ID}, ${`Provider Cost Plumbing ${runner}`}, ${`providercost-${runner}.example.com.au`}, 'tradies', 'au',
        ARRAY[]::text[],
        ${client.json([`${MARKER} ${runner} question one about plumbing`, `${MARKER} ${runner} question two about plumbing`])},
        ${PROMPT_GENERATOR_VERSION},
        'complete',
        ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
        now(), 'fixed')
    `;
  }
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status)
    VALUES
      (${INLINE_AUDIT}, ${INLINE_BRAND}, ${ORG_ID}, 1, 'manual', 'pending'),
      (${INNGEST_AUDIT}, ${INNGEST_BRAND}, ${ORG_ID}, 2, 'manual', 'pending')
  `;
}, 30000);

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await client`DELETE FROM llm_response_cache WHERE prompt LIKE ${`${MARKER}%`}`;
  await client`DELETE FROM action_items WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM audit_cost_snapshots WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM engine_call_failures WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ${ORG_ID})`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function rowsFor(auditId: string) {
  const answers = await client<
    {
      engine: string;
      prompt_index: number;
      llm_cost_usd: string | null;
      llm_cost_source: string | null;
    }[]
  >`
    SELECT engine, prompt_index, llm_cost_usd, llm_cost_source FROM citations
    WHERE audit_id = ${auditId} ORDER BY engine, prompt_index
  `;
  const failures = await client<
    {
      engine: string;
      prompt_index: number;
      error_class: string;
      cost_usd: string;
      cost_source: string | null;
    }[]
  >`
    SELECT engine, prompt_index, error_class, cost_usd, cost_source FROM engine_call_failures
    WHERE audit_id = ${auditId} ORDER BY engine, prompt_index
  `;
  return { answers, failures };
}

/** Free tier: chatgpt + perplexity x 2 questions; Perplexity's second answer came back blank. */
function expectRecordedCosts({ answers, failures }: Awaited<ReturnType<typeof rowsFor>>) {
  expect(answers).toEqual([
    {
      engine: "chatgpt",
      prompt_index: 0,
      llm_cost_usd: "0.001200",
      llm_cost_source: "price_table",
    },
    {
      engine: "chatgpt",
      prompt_index: 1,
      llm_cost_usd: "0.001200",
      llm_cost_source: "price_table",
    },
    {
      engine: "perplexity",
      prompt_index: 0,
      llm_cost_usd: "0.004620",
      llm_cost_source: "provider_reported",
    },
  ]);
  expect(failures).toEqual([
    {
      engine: "perplexity",
      prompt_index: 1,
      error_class: "empty_response",
      cost_usd: "0.004620",
      cost_source: "provider_reported",
    },
  ]);
}

describe("each recorded call cost says where it came from", () => {
  it("lib/audit/run-audit-inline.ts: Perplexity's usage.cost.total_cost is the answer's and the failure's cost, provider-reported", async () => {
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");

    await runAuditInline(INLINE_AUDIT);

    expectRecordedCosts(await rowsFor(INLINE_AUDIT));
  });

  it("inngest/functions/run-audit.ts: the same, through the Inngest runner's own inserts", async () => {
    const { runAudit } = await import("@/inngest/functions/run-audit");
    type Handler = (ctx: {
      event: { data: { auditId: string } };
      step: {
        run: (name: string, fn: () => unknown) => unknown;
        sendEvent: () => Promise<unknown>;
      };
    }) => Promise<unknown>;
    const fn = (runAudit as unknown as { fn: Handler }).fn;

    await fn({
      event: { data: { auditId: INNGEST_AUDIT } },
      step: { run: (_name, stepFn) => stepFn(), sendEvent: async () => ({ ids: [] }) },
    });

    expectRecordedCosts(await rowsFor(INNGEST_AUDIT));
  });
});
