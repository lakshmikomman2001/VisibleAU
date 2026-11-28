/**
 * S04B part 2 (LLD amendment 100), through both real runners on the mock model's openai_out_of_quota scenario (every
 * ChatGPT call gets OpenAI's 429 insufficient_quota; Perplexity answers):
 * - the refusal is provider_quota; after the first one ChatGPT is sent no more calls in that audit, and each call not
 *   sent is recorded as failed with the same class, attempts 0 and nothing billed, keeping the refusal's words;
 * - the per-engine count still counts every ChatGPT question ("{n} failed -- not counted");
 * - the operators get one email per provider per day, through the real claim in rate_limit_counters;
 * - /admin/settings' Provider errors lists the refusal (lib/audit/engine-refusals.ts).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

// S01B part 3 (LLD amendment 50): the inline runner's recommendation step searches Wikipedia; answered from a recording.
vi.mock("@/lib/brand-entity/wikipedia-au", async (importOriginal) =>
  (await import("@/tests/helpers/recorded-network")).recordedWikipedia(importOriginal),
);

const ORG_ID = randomUUID();
const INLINE_BRAND = randomUUID();
const INNGEST_BRAND = randomUUID();
const INLINE_AUDIT = randomUUID();
const INNGEST_AUDIT = randomUUID();
const PROMPTS = 7;
const ALERT_KEY = "engine-provider-quota-alert:chatgpt";
const OPENAI_SENTENCE =
  "You exceeded your current quota, please check your plan and billing details.";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

const mail = vi.hoisted(() => ({ subjects: [] as string[] }));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmailOrThrow: vi.fn(async (input: { subject: string }) => {
    mail.subjects.push(input.subject);
    return "email-id";
  }),
  sendEmail: vi.fn(async (input: { subject: string }) => {
    mail.subjects.push(input.subject);
    return { ok: true, id: "email-id" };
  }),
}));

let client: ReturnType<typeof postgres>;
const chatgptRequests = { count: 0 };

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  vi.stubEnv("PLATFORM_ADMIN_EMAILS", "quota-operator@example.test");
  client = postgres(url, { max: 1 });
  await client`DELETE FROM rate_limit_counters WHERE bucket_key = ${ALERT_KEY}`;

  const { MockLLM } = await import("@/lib/llm/mock-impl");
  const complete = MockLLM.prototype.complete;
  vi.spyOn(MockLLM.prototype, "complete").mockImplementation(function (
    this: InstanceType<typeof MockLLM>,
    input,
  ) {
    if (input.engine === "chatgpt") chatgptRequests.count += 1;
    return complete.call(this, input);
  });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`quota-stop-${ORG_ID}`}, 'Quota Stop Test Org', ${`quota-stop-org-${ORG_ID}`})
  `;
  for (const [brandId, runner] of [
    [INLINE_BRAND, "inline"],
    [INNGEST_BRAND, "inngest"],
  ] as const) {
    await client`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
      VALUES (${brandId}, ${ORG_ID}, ${`Quota Stop Plumbing ${runner}`}, ${`quotastop-${runner}.example.com.au`}, 'tradies', 'au',
        ARRAY[]::text[],
        ${client.json(Array.from({ length: PROMPTS }, (_, i) => `Organic quota prompt ${i + 1} about plumbing (${runner})`))},
        ${PROMPT_GENERATOR_VERSION},
        'complete',
        ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
        now(), 'fixed')
    `;
  }
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
    VALUES
      (${INLINE_AUDIT}, ${INLINE_BRAND}, ${ORG_ID}, 1, 'manual', 'pending', ${client.json({ mockScenario: "openai_out_of_quota" })}),
      (${INNGEST_AUDIT}, ${INNGEST_BRAND}, ${ORG_ID}, 2, 'manual', 'pending', ${client.json({ mockScenario: "openai_out_of_quota" })})
  `;
});

afterAll(async () => {
  for (const auditId of [INLINE_AUDIT, INNGEST_AUDIT]) {
    await client`DELETE FROM engine_call_failures WHERE audit_id = ${auditId}`;
    await client`DELETE FROM citations WHERE audit_id = ${auditId}`;
    await client`DELETE FROM action_items WHERE audit_id = ${auditId}`;
    await client`DELETE FROM audit_reach_results WHERE audit_id = ${auditId}`;
    await client`DELETE FROM audits WHERE id = ${auditId}`;
  }
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client`DELETE FROM rate_limit_counters WHERE bucket_key = ${ALERT_KEY}`;
  await client.end();
  vi.unstubAllEnvs();
});

type FailureRow = {
  error_class: string;
  attempts: number;
  error_message: string;
  cost_usd: string | null;
};

async function chatgptFailures(auditId: string): Promise<FailureRow[]> {
  return client<FailureRow[]>`
    SELECT error_class, attempts, error_message, cost_usd FROM engine_call_failures
    WHERE audit_id = ${auditId} AND engine = 'chatgpt' ORDER BY prompt_index`;
}

function expectStopped(rows: FailureRow[], sent: number) {
  expect(rows).toHaveLength(PROMPTS);
  for (const r of rows) expect(r.error_class).toBe("provider_quota");
  const refused = rows.filter((r) => r.attempts > 0);
  const notSent = rows.filter((r) => r.attempts === 0);
  expect(refused).toHaveLength(sent);
  expect(notSent).toHaveLength(PROMPTS - sent);
  for (const r of refused) expect(r.error_message).toContain(OPENAI_SENTENCE);
  for (const r of notSent) {
    expect(r.error_message).toMatch(
      /^Not sent: ChatGPT refused an earlier call in this audit\. HTTP 429 insufficient_quota/,
    );
    expect(Number(r.cost_usd)).toBe(0);
  }
}

describe("after the first spend or quota refusal, that engine is sent no more calls", () => {
  it("the inline runner: one request, then every other ChatGPT call recorded as not sent", async () => {
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
    chatgptRequests.count = 0;
    await runAuditInline(INLINE_AUDIT, { concurrencyLimit: 1 });

    expect(chatgptRequests.count).toBe(1);
    expectStopped(await chatgptFailures(INLINE_AUDIT), 1);
    const [audit] = await client<{ status: string; metadata: Record<string, unknown> }[]>`
      SELECT status, metadata FROM audits WHERE id = ${INLINE_AUDIT}`;
    expect(audit.status).toBe("complete");
    // Every ChatGPT question is still counted as failed, as today.
    expect((audit.metadata.engineFailures as Record<string, number>).chatgpt).toBe(PROMPTS);
    const [{ answers }] = await client<{ answers: number }[]>`
      SELECT count(*)::int AS answers FROM citations WHERE audit_id = ${INLINE_AUDIT} AND engine = 'perplexity'`;
    expect(answers).toBe(PROMPTS);
  });

  it("the Inngest runner: the calls in flight finish; every later step reads the refusal and sends nothing", async () => {
    const { runAudit } = await import("@/inngest/functions/run-audit");
    const { deriveEngineCallConcurrency } = await import("@/lib/audit/concurrency-limit");
    type Handler = (ctx: {
      event: { data: { auditId: string } };
      step: {
        run: (name: string, fn: () => unknown) => unknown;
        sendEvent: () => Promise<unknown>;
      };
    }) => Promise<unknown>;
    const fn = (runAudit as unknown as { fn: Handler }).fn;
    chatgptRequests.count = 0;
    await fn({
      event: { data: { auditId: INNGEST_AUDIT } },
      step: { run: (_name, stepFn) => stepFn(), sendEvent: async () => ({ ids: [] }) },
    });

    const inFlight = deriveEngineCallConcurrency(2);
    expect(chatgptRequests.count).toBeGreaterThanOrEqual(1);
    expect(chatgptRequests.count).toBeLessThanOrEqual(inFlight);
    expect(chatgptRequests.count).toBeLessThan(PROMPTS);
    expectStopped(await chatgptFailures(INNGEST_AUDIT), chatgptRequests.count);
  });

  it("the operators got one email for the provider across both audits (one per provider per day)", () => {
    const alerts = mail.subjects.filter((s) => s.startsWith("[ops] ChatGPT refused calls"));
    expect(alerts).toEqual([
      "[ops] ChatGPT refused calls: spend or quota limit reached (Audit #1)",
    ]);
  });

  it("/admin/settings lists the refusal: engine, class, the provider's message, first and last seen, audits affected", async () => {
    const { loadEngineRefusalGroups } = await import("@/lib/audit/engine-refusals");
    const { groups } = await loadEngineRefusalGroups(50);
    const mine = groups.find((g) => g.engine === "ChatGPT" && g.message === OPENAI_SENTENCE);
    expect(mine).toBeDefined();
    if (!mine) return;
    expect(mine.errorClass).toBe("provider_quota");
    expect(mine.audits).toBeGreaterThanOrEqual(2);
    expect(mine.refused).toBeGreaterThanOrEqual(1 + chatgptRequests.count);
    expect(mine.notSent).toBeGreaterThanOrEqual(PROMPTS - 1 + PROMPTS - chatgptRequests.count);
    expect(new Date(mine.firstSeen).getTime()).toBeLessThanOrEqual(
      new Date(mine.lastSeen).getTime(),
    );
    const lastSeen = groups.map((g) => new Date(g.lastSeen).getTime());
    expect(lastSeen).toEqual([...lastSeen].sort((a, b) => b - a));
  });
});
