/**
 * Task #46 Phase 2, Part C -- real-DB proof for the audit page's
 * honest LLM-calls label. The old "{engines x prompts x runsPerPrompt}
 * LLM calls" header was a pure configuration product, identical
 * whether every call was live or every call replayed from cache.
 * Replaced with "{engines x prompts} prompt × engine pairs · {live}
 * live calls · {cached} cached", where live/cached are counted
 * directly from citations.is_cache_hit (migration 0044) OR'd with the
 * pre-existing cost_estimate_usd = 0 inference (so a historical row
 * written before the column existed still counts correctly).
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const ENGINES = ["chatgpt", "claude"];

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
    INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${ORG_ID}, ${`llm-${ORG_ID}`}, 'LLM Calls Test Org', ${`llm-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Calls Label Co', 'callslabel.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;
  // 2 engines x 3 prompts = 6 prompt x engine pairs, runsPerPrompt = 3
  // (so 18 total citation rows), matching the header's two independent
  // figures: 6 pairs, and a live/cached split across the 18 rows.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'complete', ${ENGINES}, 3, 3, now())
  `;

  let n = 0;
  for (const engine of ENGINES) {
    for (let p = 0; p < 3; p++) {
      for (let r = 1; r <= 3; r++) {
        n++;
        // Run 1 of each (engine, prompt) pair: a real, live call --
        // is_cache_hit = false, a real non-zero cost.
        // Runs 2-3: cache replays -- is_cache_hit = true (the new,
        // reliable signal), cost 0 (matches getCached()'s own
        // costEstimateUsd: 0 by construction).
        const isCacheHit = r > 1;
        await client`
          INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet, llm_cost_usd, is_cache_hit)
          VALUES (${AUDIT_ID}, ${engine}, ${`prompt ${p}`}, ${r}, false, false, ${client.json([])}, ${`response ${n}`},
            ${isCacheHit ? "0" : "0.002000"}, ${isCacheHit})
        `;
      }
    }
  }

  // One more historical-shaped row: is_cache_hit defaults to false (as
  // it would for any row written before migration 0044), but its cost
  // is 0 -- the OR'd cost-based inference must still count it as
  // cached, proving old rows aren't silently miscounted as "live".
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet, llm_cost_usd, is_cache_hit)
    VALUES (${AUDIT_ID}, 'gemini', 'legacy prompt', 1, false, false, ${client.json([])}, 'legacy response', '0', false)
  `;
});

afterAll(async () => {
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
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

describe("audit detail page — honest LLM-calls label", () => {
  it('shows "N prompt × engine pairs", not the old nominal "engines x prompts x runs" total', async () => {
    const html = await renderAuditPage(AUDIT_ID);
    // 2 engines x 3 prompts = 6 pairs -- NOT 18 (which the old label
    // would have shown: engines x prompts x runsPerPrompt).
    expect(html).toContain("6 prompt × engine pairs");
    expect(html).not.toContain("18 LLM calls");
  });

  it("counts live calls from is_cache_hit = false (6 real run-1 calls across the 2 engines x 3 prompts)", async () => {
    const html = await renderAuditPage(AUDIT_ID);
    // 6 real run_number=1 rows with is_cache_hit=false + the one
    // legacy row (is_cache_hit=false but cost=0, so it's NOT counted
    // as live -- see the next test) = 6 live calls.
    expect(html).toContain("6 live calls");
  });

  it("counts cached calls from is_cache_hit = true, OR'd with the cost_estimate_usd = 0 fallback for a historical-shaped row", async () => {
    const html = await renderAuditPage(AUDIT_ID);
    // 12 real replay rows (is_cache_hit=true) + 1 legacy row
    // (is_cache_hit=false, but cost=0 -- the fallback inference) = 13.
    expect(html).toContain("13 cached");
  });
});
