/**
 * Vunnara Build 1 addendum, item 6 -- real-DB, real-runner proof that
 * an engine's failed call never aborts the whole audit, is excluded
 * from the organic sample (never counted as "not mentioned"), and is
 * recorded + shown on the page -- not just silently swallowed into a
 * console.error that vanishes with the process.
 *
 * MockLLM creates a fresh instance per call under NODE_ENV=test
 * (lib/llm/index.ts), so its callCount-based "~40%" partial_failure
 * math (lib/llm/mock-impl.ts) always lands on the failing branch here
 * -- every call for the engine under this scenario fails, which still
 * cleanly proves the real question: does a 100%-failed engine abort
 * the audit, or get silently miscounted? (It does neither.)
 *
 * Audit reliability, Part A: MockLLM's partial_failure fixtures throw
 * a bare `Error("Mock error 500")` -- lib/llm/classify-error.ts reads
 * that as errorClass "other" (500 isn't 429/503/529), which is
 * deliberately NOT retryable, so this still exercises exactly one
 * attempt per call, same as before this hotfix -- now recorded as a
 * real engine_call_failures row instead of only an in-memory counter.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();

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
    VALUES (${ORG_ID}, ${`enginefail-${ORG_ID}`}, 'Engine Failure Test Org', ${`enginefail-org-${ORG_ID}`})
  `;
  // Build 1 addendum, item 9: getAuditPrompts() blocks an unconfirmed
  // brand before reaching this test's real runAuditInline() call --
  // must look genuinely confirmed.
  // Vunnara hotfix 2 (19 Oct, post-609e323), item 4: stamped at the
  // CURRENT generator version -- otherwise getAuditPrompts() would see
  // this deliberately-minimal 3-prompt fixture as stale (every row
  // defaults to generator version 1) and silently regenerate a full
  // real pack (10 organic + 3 branded) in its place before this test
  // ever gets to exercise the engine-failure behaviour it's actually
  // testing.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Engine Failure Co', 'enginefailure.example.com.au', 'tradies', 'au',
      ARRAY[]::text[],
      ${client.json(Array.from({ length: 3 }, (_, i) => `Organic test prompt ${i + 1} about plumbing`))},
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
  await client`DELETE FROM action_items WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("A failing engine never aborts the audit, and is recorded, not silently dropped (Build 1 addendum, item 6)", () => {
  it("the audit still completes, with no citation rows written for the failed engine, and a real engine_call_failures row per failed call", async () => {
    await runAuditInline(AUDIT_ID);

    const [audit] = await client<{ status: string; metadata: Record<string, unknown> }[]>`
      SELECT status, metadata FROM audits WHERE id = ${AUDIT_ID}
    `;
    expect(audit.status).toBe("complete");

    const citationRows = await client`SELECT * FROM citations WHERE audit_id = ${AUDIT_ID}`;
    expect(citationRows.length).toBe(0);

    // Free tier runs both chatgpt and perplexity (lib/llm/tier-engines.ts)
    // -- both fixtures' partial_failure.json entries are all error_status,
    // so both engines fail 100% of their 3 calls under this scenario.
    const failures = audit.metadata.engineFailures as Record<string, number>;
    expect(failures.chatgpt).toBe(3);
    expect(failures.perplexity).toBe(3);

    // Audit reliability, Part A, item 1/2/3/4: a real row per failed
    // call -- which prompt, classified as "other" (Mock error 500 is
    // neither 429/503/529), exactly one attempt (not retryable), a
    // real (if small) latency, and 0 cost (MockLLM throws before
    // returning any usage to bill).
    const failureRows = await client<
      { engine: string; error_class: string; attempts: number; latency_ms: number; cost_usd: string }[]
    >`SELECT * FROM engine_call_failures WHERE audit_id = ${AUDIT_ID} ORDER BY engine, prompt`;
    expect(failureRows.length).toBe(6); // 3 chatgpt + 3 perplexity
    for (const row of failureRows) {
      expect(["chatgpt", "perplexity"]).toContain(row.engine);
      expect(row.error_class).toBe("other");
      expect(row.attempts).toBe(1);
      expect(row.latency_ms).toBeGreaterThanOrEqual(0);
      expect(Number(row.cost_usd)).toBe(0);
    }
  });

  it("the audit page shows WHY it failed (the real error-class breakdown), not just a bare count, and that scores exclude it", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const element = await AuditPage({
      params: Promise.resolve({ auditId: AUDIT_ID }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    // Per-engine breakdown (was "search failed for 3 of 3 questions"):
    // audit #36 (25 Oct) moved it to its own line, "3 failed — not
    // counted", with the reason breakdown on hover.
    expect(html).toContain("3 failed — not counted");
    expect(html).toContain('title="3 failed: 3 errors"');
    // Audit-wide breakdown (was "6 searches failed this audit and are
    // excluded") -- merged across both engines, "6 errors" once, never
    // "3 errors, 3 errors".
    expect(html).toMatch(/6 failed: 6 errors this audit, excluded/);
    expect(html).not.toMatch(/6 errors, 3 errors|3 errors, 3 errors/);
  });
});
