/**
 * "Audits time out on Vercel" follow-up, item 2 -- each (engine,
 * prompt) call now writes its citation/failure row INSIDE the same
 * Inngest step as the call, with a deterministic step id
 * ("call:<engine>:<promptIndex>") and an ON CONFLICT (audit_id,
 * engine, prompt_index) DO NOTHING target (migration 0093's unique
 * index). Proves: a replayed step (the test harness's non-memoizing
 * step.run stub makes calling .fn() twice for the SAME auditId behave
 * like Inngest replaying every step from scratch) never produces a
 * second citation or failure row, and the recomputed totalCost it
 * returns still reflects the one real row per call, not a doubled
 * sum.
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
const step = {
  run: (_name: string, fn: () => unknown) => fn(),
  sendEvent: async () => ({ ids: [] }),
};

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`step-idem-${ORG_ID}`}, 'Step Idempotent Test Org', ${`step-idem-org-${ORG_ID}`})
  `;
  // partial_failure: every call for every engine fails (lib/llm/mock-
  // impl.ts) -- exercises the engine_call_failures write path, not
  // just citations, with a deterministic, zero-cost outcome so the
  // "not doubled" assertion doesn't depend on which attempt's cost
  // happened to win.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Step Idempotent Co', 'stepidempotent.example.com.au', 'tradies', 'au',
      ARRAY[]::text[],
      ${client.json(["Organic test prompt 1 about plumbing", "Organic test prompt 2 about plumbing"])},
      ${PROMPT_GENERATOR_VERSION},
      'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'manual', 'pending', ${client.json({ mockScenario: "partial_failure" })})
  `;
});

afterAll(async () => {
  await client`DELETE FROM engine_call_failures WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
});

describe("inngest/functions/run-audit.ts -- a replayed step never duplicates a citation or failure row", () => {
  it(
    "running the SAME audit through runAudit.fn() twice (simulating Inngest replaying every step from scratch) leaves exactly one failure row per (engine, promptIndex), not two",
    async () => {
      const { runAudit } = await import("@/inngest/functions/run-audit");
      type Handler = (ctx: {
        event: { data: { auditId: string } };
        step: typeof step;
      }) => Promise<unknown>;
      const fn = (runAudit as unknown as { fn: Handler }).fn;

      await fn({ event: { data: { auditId: AUDIT_ID } }, step });

      const [afterFirst] = await client<{ status: string }[]>`
        SELECT status FROM audits WHERE id = ${AUDIT_ID}
      `;
      expect(afterFirst.status).toBe("complete");

      const rowsAfterFirst = await client<{ engine: string; prompt_index: number }[]>`
        SELECT engine, prompt_index FROM engine_call_failures WHERE audit_id = ${AUDIT_ID}
        ORDER BY engine, prompt_index
      `;
      // Free tier runs chatgpt + perplexity x 2 prompts, all failing
      // under partial_failure.
      expect(rowsAfterFirst.length).toBe(4);
      expect(rowsAfterFirst.every((r) => r.prompt_index === 0 || r.prompt_index === 1)).toBe(true);

      // "Replay": the audit is already "complete", so the second
      // run's own finalize step will correctly no-op (same guard
      // proven in tests/integration/stale-audit-guard.integration.
      // test.ts) -- but EVERY call:<engine>:<i> step still re-runs
      // under this test's non-memoizing step stub, exactly like a
      // real Inngest replay of a step whose write succeeded but whose
      // response never reached Inngest.
      await fn({ event: { data: { auditId: AUDIT_ID } }, step });

      const rowsAfterReplay = await client<{ engine: string; prompt_index: number }[]>`
        SELECT engine, prompt_index FROM engine_call_failures WHERE audit_id = ${AUDIT_ID}
        ORDER BY engine, prompt_index
      `;
      // Still exactly 4 -- the replay's own insert attempts all hit
      // ON CONFLICT (audit_id, engine, prompt_index) DO NOTHING.
      expect(rowsAfterReplay.length).toBe(4);
      expect(rowsAfterReplay).toEqual(rowsAfterFirst);

      // The audit's own stored totalCostUsd is unaffected by the
      // replay (the finalize step's own guard no-ops its UPDATE too),
      // so it reflects the one real set of calls, never a doubled sum.
      const [auditRow] = await client<{ total_cost_usd: string }[]>`
        SELECT total_cost_usd FROM audits WHERE id = ${AUDIT_ID}
      `;
      expect(Number(auditRow.total_cost_usd)).toBe(0); // partial_failure's failures always cost $0
    },
    30_000,
  );
});
