/**
 * "Mention detection" (6 Nov), part 2 -- real DB (migration 0123), both real runners. Each adapter's own
 * handling of a provider's stop is tested with canned SDK responses (tests/unit/llm/stop-reason-adapters
 * .test.ts); here the engines report those outcomes, and the runners must store a truncated answer with its
 * flag and stop reason, and record an answer the provider didn't finish as a failure with its cost --
 * never as an answer. The audit page then says which answer was cut off.
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
const INLINE_BRAND = randomUUID();
const INNGEST_BRAND = randomUUID();
const INLINE_AUDIT = randomUUID();
const INNGEST_AUDIT = randomUUID();
const MARKER = `stop-reasons-${ORG_ID.slice(0, 8)}`;

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// Free tier: ChatGPT and Perplexity, two questions each. Question one is an answer (ChatGPT's cut off at
// the length limit); question two never finished (a provider filter, a Claude-style paused turn).
vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  const { IncompleteAnswerError } = await import("@/lib/llm/errors");
  const { pausedAnswerMessage, providerFilterMessage } = await import("@/lib/llm/stop-reason");
  const answer = (stopReason: string, truncated: boolean) => ({
    response: "A plain answer that names no business at all.",
    model: "gpt-4.1-mini",
    tokensUsed: 100,
    costEstimateUsd: 0.001,
    costSource: "price_table" as const,
    stopReason,
    truncated,
    isCacheHit: false,
  });
  return {
    ...actual,
    getLLMService: (engine: Engine = "chatgpt") => ({
      complete: async ({ prompt }: { prompt: string }) => {
        const second = prompt.includes("question two");
        if (engine === "chatgpt") {
          if (second) {
            throw new IncompleteAnswerError(
              providerFilterMessage("content_filter"),
              "content_filter",
              0.0012,
              0,
              "price_table",
            );
          }
          return answer("max_output_tokens", true);
        }
        if (second) {
          throw new IncompleteAnswerError(
            pausedAnswerMessage(4),
            "pause_turn",
            0.004,
            0,
            "price_table",
          );
        }
        return answer("stop", false);
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
    VALUES (${ORG_ID}, ${`stop-reasons-${ORG_ID}`}, 'Stop Reasons Test Org', ${`stop-reasons-org-${ORG_ID}`})
  `;
  for (const [brandId, runner] of [
    [INLINE_BRAND, "inline"],
    [INNGEST_BRAND, "inngest"],
  ] as const) {
    await client`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
      VALUES (${brandId}, ${ORG_ID}, ${`Stop Reasons Plumbing ${runner}`}, ${`stopreasons-${runner}.example.com.au`}, 'tradies', 'au',
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
      stop_reason: string | null;
      answer_truncated: boolean | null;
    }[]
  >`
    SELECT engine, prompt_index, stop_reason, answer_truncated FROM citations
    WHERE audit_id = ${auditId} ORDER BY engine, prompt_index
  `;
  const failures = await client<
    {
      engine: string;
      prompt_index: number;
      error_class: string;
      error_message: string | null;
      attempts: number;
      cost_usd: string;
    }[]
  >`
    SELECT engine, prompt_index, error_class, error_message, attempts, cost_usd FROM engine_call_failures
    WHERE audit_id = ${auditId} ORDER BY engine, prompt_index
  `;
  return { answers, failures };
}

async function expectStops(auditId: string) {
  const { answers, failures } = await rowsFor(auditId);
  expect(answers).toEqual([
    {
      engine: "chatgpt",
      prompt_index: 0,
      stop_reason: "max_output_tokens",
      answer_truncated: true,
    },
    { engine: "perplexity", prompt_index: 0, stop_reason: "stop", answer_truncated: false },
  ]);
  expect(failures).toEqual([
    {
      engine: "chatgpt",
      prompt_index: 1,
      error_class: "incomplete_answer",
      error_message: "Provider stopped the answer (safety or recitation filter): content_filter",
      attempts: 1,
      cost_usd: "0.001200",
    },
    {
      engine: "perplexity",
      prompt_index: 1,
      error_class: "incomplete_answer",
      error_message: expect.stringMatching(/^Answer incomplete: /),
      attempts: 1,
      cost_usd: "0.004000",
    },
  ]);

  const { describeEngineFailure } = await import("@/lib/audit/engine-failure");
  expect(
    failures.map(
      (f) => describeEngineFailure({ errorClass: f.error_class, message: f.error_message }).label,
    ),
  ).toEqual(["Provider stopped the answer (safety or recitation filter)", "Answer incomplete"]);
}

describe("a provider's stop decides what is stored", () => {
  it("lib/audit/run-audit-inline.ts: the truncated answer is kept and flagged; the unfinished ones are failures, not answers", async () => {
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");

    await runAuditInline(INLINE_AUDIT);

    await expectStops(INLINE_AUDIT);
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

    await expectStops(INNGEST_AUDIT);
  });

  it("the audit page says which answer was cut off at the length limit", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const html = renderToStaticMarkup(
      await AuditPage({
        params: Promise.resolve({ auditId: INLINE_AUDIT }),
        searchParams: Promise.resolve({ tab: "responses" }),
      }),
    );

    expect(html.match(/Answer cut off at the length limit/g)).toHaveLength(1);
  });
});
