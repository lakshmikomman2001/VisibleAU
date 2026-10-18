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
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM action_items WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("A failing engine never aborts the audit, and is recorded, not silently dropped (Build 1 addendum, item 6)", () => {
  it("the audit still completes, with no citation rows written for the failed engine", async () => {
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
  });

  it("the audit page shows the failure count per engine, and that scores exclude it", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const element = await AuditPage({
      params: Promise.resolve({ auditId: AUDIT_ID }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("search failed for 3 of 3 questions");
    expect(html).toContain("excluded, not &quot;not mentioned&quot;");
    expect(html).toMatch(/6 searches failed this audit and are excluded/);
  });
});
