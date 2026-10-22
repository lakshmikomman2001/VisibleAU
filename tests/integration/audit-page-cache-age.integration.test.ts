/**
 * "The cached-answer age must be the age of the content" (23 Oct),
 * item 2 -- real-DB proof that the audit page shows how old a reused
 * answer's CONTENT actually is, not when its cache row was first ever
 * created. Production evidence: audit #33 showed "cached answers from
 * 19 Oct 10:57 (up to 82h old)" even after the prior task's fix
 * (filtering out expired rows) -- because a row that's been refreshed
 * since 19 Oct keeps that original created_at forever, even though
 * its CURRENT content was actually fetched only ~11h before audit #33
 * ran.
 *
 * citations.cached_from_at (set once, at write time, from the real
 * cache row's fetched_at -- never re-derived later from whatever
 * llm_response_cache says at page-view time) is the fix: this test
 * seeds a cache row CREATED 44h ago but whose citation reused content
 * that was actually REFRESHED only 11h ago, and proves the page shows
 * 11h, never 44h.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const CACHED_AUDIT_ID = randomUUID();
const LIVE_AUDIT_ID = randomUUID();
const NULL_FETCHED_AT_AUDIT_ID = randomUUID();

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

let client: ReturnType<typeof postgres>;
const CACHE_ROW_CREATED_AT = new Date(Date.now() - 82 * 3600 * 1000); // 82h ago -- the stale, first-ever-insert time
const REAL_FETCH_TIME = new Date(Date.now() - 11 * 3600 * 1000); // 11h ago -- when THIS content was actually produced (a later refresh)

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

  // audit #33's exact shape: a citation that reused content REFRESHED
  // 11h ago, from a cache row originally CREATED 82h ago (and never
  // updated since, in llm_response_cache -- this test's whole point is
  // that the PAGE must never read that stale created_at at all).
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at, methodology_version)
    VALUES (${CACHED_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 33, 'complete', ${["chatgpt"]}, 1, 1, now(), 1)
  `;
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet, llm_model, is_cache_hit, llm_cost_usd, cached_from_at)
    VALUES (${CACHED_AUDIT_ID}, 'chatgpt', 'Best plumber in Bondi?', 1, false, false, ${client.json([])}, 'Try a few local plumbers.', 'gpt-cache-age-test', true, '0', ${REAL_FETCH_TIME})
  `;

  // A second audit with only LIVE (non-cached) rows -- no age line at all.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at, methodology_version)
    VALUES (${LIVE_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 34, 'complete', ${["chatgpt"]}, 1, 1, now(), 1)
  `;
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet, llm_model, is_cache_hit, llm_cost_usd)
    VALUES (${LIVE_AUDIT_ID}, 'chatgpt', 'A different, never-cached question?', 1, false, false, ${client.json([])}, 'A fresh answer.', 'gpt-live-only', false, '0.002')
  `;

  // A third audit: a genuine cache hit, but one served from a cache
  // row that predates migration 0095 and was never refreshed since
  // (cached_from_at NULL -- never invented). No age line, same as "no
  // cached line" -- age unknown is honest, not a guess.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at, methodology_version)
    VALUES (${NULL_FETCHED_AT_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 35, 'complete', ${["chatgpt"]}, 1, 1, now(), 1)
  `;
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet, llm_model, is_cache_hit, llm_cost_usd)
    VALUES (${NULL_FETCHED_AT_AUDIT_ID}, 'chatgpt', 'Pre-migration cache hit?', 1, false, false, ${client.json([])}, 'An older cached answer.', 'gpt-pre-migration', true, '0')
  `;
});

afterAll(async () => {
  const ids = [CACHED_AUDIT_ID, LIVE_AUDIT_ID, NULL_FETCHED_AT_AUDIT_ID];
  await client`DELETE FROM citations WHERE audit_id = ANY(${ids})`;
  await client`DELETE FROM audits WHERE id = ANY(${ids})`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
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

describe("Audit page -- cached-answer age is the age of the CONTENT (item 2)", () => {
  it("shows the real fetch time (11h old), never the cache row's stale 82h-old created_at", async () => {
    const html = await renderAuditPage(CACHED_AUDIT_ID);
    expect(html).toContain("reused answers fetched at");
    expect(html).toContain("11h old");
    expect(html).not.toContain("82h old");
  });

  it("shows no age line when every answer is live (nothing cached)", async () => {
    const html = await renderAuditPage(LIVE_AUDIT_ID);
    expect(html).not.toContain("reused answers fetched at");
  });

  it("shows no age line for a cache hit whose cached_from_at is NULL (pre-migration, age genuinely unknown) -- never a guess", async () => {
    const html = await renderAuditPage(NULL_FETCHED_AT_AUDIT_ID);
    expect(html).not.toContain("reused answers fetched at");
  });
});
