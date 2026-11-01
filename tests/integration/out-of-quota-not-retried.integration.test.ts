/**
 * Out-of-quota follow-up (1 Nov, Sri's decision), item 4 -- through the
 * real inline runner: an OpenAI account out of quota (every ChatGPT call
 * gets OpenAI's 429 insufficient_quota) records each failed call ONCE
 * (attempts = 1; on the old code, 3), still counts toward ChatGPT's
 * "N failed", and still raises the whole-engine-failure alert, with the
 * credit/quota reason in the email. Perplexity answers as usual.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fullyFailedEngines } from "@/lib/audit/engine-failure";
import { findEngineTotalFailures } from "@/lib/audit/engine-total-failure-alert";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { engineTotalFailureEmail } from "@/lib/email/templates/alerts/engine-total-failure";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const CREDIT_LABEL = "Provider error: account/credit issue";
const CREDIT_CHECK =
  "The provider says the account is out of credit or over its quota. Check billing and credits in the provider's console.";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`outofquota-${ORG_ID}`}, 'Out Of Quota Test Org', ${`outofquota-org-${ORG_ID}`})
  `;
  // Confirmed, at the current generator version, with a 3-question pack
  // (as tests/integration/audit-engine-failure.integration.test.ts), so
  // getAuditPrompts() runs these 3 and doesn't regenerate a full pack.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Out Of Quota Co', 'outofquota.example.com.au', 'tradies', 'au',
      ARRAY[]::text[],
      ${client.json(Array.from({ length: 3 }, (_, i) => `Organic test prompt ${i + 1} about plumbing`))},
      ${PROMPT_GENERATOR_VERSION},
      'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'manual', 'pending', ${client.json({ mockScenario: "openai_out_of_quota" })})
  `;
});

afterAll(async () => {
  await client`DELETE FROM engine_call_failures WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM action_items WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("an OpenAI account out of quota, through the inline runner (1 Nov)", () => {
  it("each ChatGPT call is recorded once, not retried, and counts toward ChatGPT's failures", async () => {
    await runAuditInline(AUDIT_ID);

    const [audit] = await client<
      {
        status: string;
        engines: string[];
        prompts_count: number;
        metadata: Record<string, unknown>;
      }[]
    >`SELECT status, engines, prompts_count, metadata FROM audits WHERE id = ${AUDIT_ID}`;
    expect(audit.status).toBe("complete");
    // Free tier: ChatGPT and Perplexity (lib/llm/tier-engines.ts).
    const failures = audit.metadata.engineFailures as Record<string, number>;
    expect(failures.chatgpt).toBe(3);
    expect(failures.perplexity ?? 0).toBe(0);

    const rows = await client<
      { engine: string; error_class: string; attempts: number; error_message: string }[]
    >`SELECT engine, error_class, attempts, error_message FROM engine_call_failures WHERE audit_id = ${AUDIT_ID}`;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.engine).toBe("chatgpt");
      expect(row.attempts).toBe(1);
      expect(row.error_class).toBe("other");
      expect(row.error_message).toBe(
        "HTTP 429 insufficient_quota: You exceeded your current quota, please check your plan and billing details.",
      );
    }

    expect(
      fullyFailedEngines({
        engines: audit.engines,
        promptsCount: audit.prompts_count,
        metadata: audit.metadata,
      }),
    ).toEqual(["chatgpt"]);
  });

  it("the whole-engine-failure alert still fires, with the credit/quota reason in its email", async () => {
    const alert = await findEngineTotalFailures(AUDIT_ID);
    expect(alert).not.toBeNull();
    if (!alert) return;
    expect(alert.engines).toEqual([
      {
        engine: "chatgpt",
        reasonLabel: CREDIT_LABEL,
        reasonCheck: CREDIT_CHECK,
        errorClass: "other",
        statusCode: 429,
      },
    ]);
    const email = engineTotalFailureEmail({
      ...alert,
      audience: "org",
      auditUrl: "https://example.test/audits/1",
    });
    expect(email.text).toContain(CREDIT_LABEL);
    expect(email.text).toContain(CREDIT_CHECK);
  });
});
