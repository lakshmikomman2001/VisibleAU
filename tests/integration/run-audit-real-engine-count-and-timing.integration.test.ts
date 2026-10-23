/**
 * "The Running audit page shows made-up numbers" (23 Oct), items 1
 * and 2 -- two real-DB proofs:
 *
 * 1. An Agency Pro org's real audit uses its tier's full engine set
 *    (lib/llm/tier-engines.ts's enginesForTier("agency_pro") ->
 *    chatgpt/claude/gemini/perplexity, 4 engines), not a hardcoded
 *    guess. Investigating item 1's "2 engines" production evidence
 *    found no bug here -- the runner always resolved the tier
 *    correctly; "2 engines" was the progress PAGE's own hardcoded
 *    fallback literal, fixed separately in app/(auth)/audits/
 *    [auditId]/page.tsx. This test is the regression guard for the
 *    thing that WAS actually correct, so it stays that way.
 *
 * 2. inngest/functions/run-audit.ts's new "record-prompt-count" step
 *    writes promptsCount/runsPerPrompt/totalCalls right after load-
 *    pack resolves -- BEFORE the first (engine, prompt) call ever
 *    runs, not only at completion (the real root cause of production's
 *    "ChatGPT 8/0 - 0%": audits.promptsCount stayed NULL for this
 *    audit's entire run, because the Inngest runner used to write it
 *    only in its own "finalize" step).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`agency-pro-engines-${ORG_ID}`}, 'Agency Pro Engines Test Org', ${`agency-pro-engines-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_test_${ORG_ID}`}, ${`sub_test_${ORG_ID}`}, 'price_test_agency_pro', 'agency_pro', 'monthly', 'active')
  `;
  // A 2-prompt frozen pack -- keeps 4 engines x 2 prompts = 8 calls,
  // small and fast, while still exercising the real multi-engine path.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Agency Pro Engines Co', 'agencyproengines.example.com.au', 'tradies', 'au',
      ARRAY[]::text[],
      ${client.json(["Organic test prompt 1 about plumbing", "Organic test prompt 2 about plumbing"])},
      ${PROMPT_GENERATOR_VERSION},
      'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'manual', 'pending', ${client.json({ mockScenario: "happy_path" })})
  `;
}, 30000);

afterAll(async () => {
  await client`DELETE FROM engine_call_failures WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("inngest/functions/run-audit.ts -- real engine count and prompt-count timing (23 Oct)", () => {
  it("resolves the org's real agency_pro tier to its full 4-engine set, and records promptsCount/totalCalls before the first engine call", async () => {
    // Snapshots the audits row the instant "record-prompt-count"
    // resolves -- the fake step.run below calls fn() synchronously
    // (same non-memoizing stub tests/integration/run-audit-step-
    // idempotent.integration.test.ts already established for this
    // same function), so this snapshot is taken strictly BEFORE any
    // later step (the per-call dispatch loop, "finalize") can run.
    // An array (not a reassigned `let`) sidesteps TypeScript's control-
    // flow narrowing not following a reassignment made inside a
    // nested closure.
    const snapshotsAfterRecordStep: Array<{
      promptsCount: number | null;
      totalCalls: number | null;
    }> = [];

    const step = {
      run: async (name: string, fn: () => unknown) => {
        const result = await fn();
        if (name === "record-prompt-count") {
          const [row] = await client`
            SELECT prompts_count, total_calls FROM audits WHERE id = ${AUDIT_ID}
          `;
          snapshotsAfterRecordStep.push({
            promptsCount: row.prompts_count,
            totalCalls: row.total_calls,
          });
        }
        return result;
      },
      sendEvent: async () => ({ ids: [] }),
    };

    const { runAudit } = await import("@/inngest/functions/run-audit");
    type Handler = (ctx: {
      event: { data: { auditId: string } };
      step: typeof step;
    }) => Promise<unknown>;
    const fn = (runAudit as unknown as { fn: Handler }).fn;
    await fn({ event: { data: { auditId: AUDIT_ID } }, step });

    // Item 1: the real engine count is the full agency_pro tier set,
    // never a hardcoded guess.
    const [audit] = await client`
      SELECT engines, engine_count, prompts_count, total_calls FROM audits WHERE id = ${AUDIT_ID}
    `;
    expect([...audit.engines].sort()).toEqual(["chatgpt", "claude", "gemini", "perplexity"].sort());
    expect(audit.engine_count).toBe(4);
    expect(audit.prompts_count).toBe(2);
    expect(audit.total_calls).toBe(4 * 2 * 1);

    // Item 2: promptsCount/totalCalls were ALREADY correct at the
    // record-prompt-count snapshot, not only once the whole run
    // finished -- the exact production gap this task's item 1/2
    // traced "ChatGPT 8/0 - 0%" to.
    expect(snapshotsAfterRecordStep).toHaveLength(1);
    expect(snapshotsAfterRecordStep[0].promptsCount).toBe(2);
    expect(snapshotsAfterRecordStep[0].totalCalls).toBe(4 * 2 * 1);
  });
});
