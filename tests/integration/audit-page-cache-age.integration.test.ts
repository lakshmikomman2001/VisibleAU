/**
 * Vunnara Build 1 addendum, item 4 -- real-DB proof that the audit
 * page shows how OLD a reused cached answer actually is, next to the
 * "N cached" count. Live, 18 Oct: hipages Audit #29 (its first audit)
 * showed "0 live · 200 cached" dated 18 Oct, but every answer was
 * actually reused from Get Plumbing #20 (16 Oct, ~44h earlier) --
 * "cached" was honest, but the page's own date made the answers look
 * fresh. The age shown here comes from the real llm_response_cache
 * row's own created_at, via the exact key makeKey() computes --
 * never estimated.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeKey } from "@/lib/llm/cache";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const CACHED_AUDIT_ID = randomUUID();
const LIVE_AUDIT_ID = randomUUID();

const PROMPT = "Best plumber in Bondi?";
const MODEL = "gpt-cache-age-test";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

let client: ReturnType<typeof postgres>;
const CACHE_CREATED_AT = new Date(Date.now() - 44 * 3600 * 1000); // 44h ago

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`cacheage-${ORG_ID}`}, 'Cache Age Test Org', ${`cacheage-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Hipages Co', 'hipagesco.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;

  // The real cache row, written (in real life) by the FIRST brand's
  // live call -- created_at is the real "when was this first answered"
  // timestamp, 44h before "now".
  const cacheKey = makeKey(PROMPT, MODEL, "memory_only");
  await client`
    INSERT INTO llm_response_cache (cache_key, prompt, model, response, tokens_used, cost_estimate_usd, created_at, expires_at)
    VALUES (${cacheKey}, ${PROMPT}, ${MODEL}, 'Try a few local plumbers.', 50, 0, ${CACHE_CREATED_AT}, now() + interval '4 hours')
  `;

  // This audit's own citation row is a CACHE HIT (is_cache_hit = true)
  // for that same (prompt, model) -- the honest "cached" label, but the
  // cache entry itself is 44h old by the time THIS audit runs today.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at, methodology_version)
    VALUES (${CACHED_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 29, 'complete', ${["chatgpt"]}, 1, 1, now(), 1)
  `;
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet, llm_model, is_cache_hit, llm_cost_usd)
    VALUES (${CACHED_AUDIT_ID}, 'chatgpt', ${PROMPT}, 1, false, false, ${client.json([])}, 'Try a few local plumbers.', ${MODEL}, true, '0')
  `;

  // A second audit with only LIVE (non-cached) rows -- no age line
  // should appear at all.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at, methodology_version)
    VALUES (${LIVE_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 30, 'complete', ${["chatgpt"]}, 1, 1, now(), 1)
  `;
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet, llm_model, is_cache_hit, llm_cost_usd)
    VALUES (${LIVE_AUDIT_ID}, 'chatgpt', 'A different, never-cached question?', 1, false, false, ${client.json([])}, 'A fresh answer.', 'gpt-live-only', false, '0.002')
  `;
});

afterAll(async () => {
  await client`DELETE FROM citations WHERE audit_id IN (${CACHED_AUDIT_ID}, ${LIVE_AUDIT_ID})`;
  await client`DELETE FROM audits WHERE id IN (${CACHED_AUDIT_ID}, ${LIVE_AUDIT_ID})`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client`DELETE FROM llm_response_cache WHERE prompt = ${PROMPT} AND model = ${MODEL}`;
  await client.end();
});

async function renderAuditPage(auditId: string): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  const element = await AuditPage({
    params: Promise.resolve({ auditId }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(element);
}

describe("Audit page -- cached-answer age (Build 1 addendum, item 4)", () => {
  it("shows the real cache entry's age next to the cached count, derived from llm_response_cache.created_at", async () => {
    const html = await renderAuditPage(CACHED_AUDIT_ID);
    expect(html).toContain("cached answers from");
    expect(html).toContain("44h old");
  });

  it("shows no age line when every answer is live (nothing cached)", async () => {
    const html = await renderAuditPage(LIVE_AUDIT_ID);
    expect(html).not.toContain("cached answers from");
  });
});
