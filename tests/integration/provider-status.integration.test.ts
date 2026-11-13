/**
 * 13 Nov (Sri's walk-through, part 12) -- real DB: the dashboard's status is measured. A Claude answer, then
 * Claude refusing on a spend limit (audit #47's real message shape) is "Claude unavailable since <time>";
 * a later answer ends it; a rate limit is never an outage; DataForSEO refusing the login is "Google AI
 * checks unavailable"; no answers at all claims nothing.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const NOW = new Date();
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const SPEND_LIMIT =
  "400 You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.";

let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`status-${ORG_ID}`}, 'Status Org', ${`status-org-${ORG_ID}`})
  `;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Status Plumbing', 'status.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, total_calls)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'complete', ${["chatgpt", "claude"]}, 1, 1, 2)
  `;
}, 30_000);

afterAll(async () => {
  await sql`DELETE FROM engine_call_failures WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await sql`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

async function answer(engine: string, at: Date, index: number) {
  await sql`
    INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, sentiment_label, context_label, created_at)
    VALUES (${AUDIT_ID}, ${engine}, ${`p${index}`}, ${index}, 1, false, 'neutral', 'absent', ${at})
  `;
}
async function failure(
  engine: string,
  at: Date,
  index: number,
  errorClass: string,
  message: string,
) {
  await sql`
    INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts, latency_ms, created_at)
    VALUES (${AUDIT_ID}, ${ORG_ID}, ${engine}, ${`p${index}`}, ${index}, false, ${errorClass}, ${message}, 1, 100, ${at})
  `;
}
const status = async () => {
  const { loadProviderStatus } = await import("@/lib/platform/provider-status");
  return loadProviderStatus(NOW, [ORG_ID]);
};

describe("the dashboard's measured status", () => {
  it("nothing measured: no answers, no outages", async () => {
    expect(await status()).toEqual({ outages: [], answered: 0 });
  });

  it("a Claude answer, then the spend limit: Claude unavailable since the first refusal", async () => {
    await answer("claude", ago(180), 0);
    await answer("chatgpt", ago(10), 1);
    await failure("claude", ago(120), 2, "other", SPEND_LIMIT);
    await failure("claude", ago(60), 3, "other", SPEND_LIMIT);
    await failure("chatgpt", ago(30), 4, "rate_limited", "429 Rate limit reached for requests");
    const s = await status();
    expect(s.answered).toBe(2);
    expect(s.outages.map((o) => [o.provider, o.since.toISOString()])).toEqual([
      ["claude", ago(120).toISOString()],
    ]);
    const { providerStatusLine } = await import("@/lib/platform/provider-status");
    expect(
      providerStatusLine(
        s,
        { planEngines: ["chatgpt", "claude", "gemini", "perplexity"], usesGoogle: false },
        NOW,
      )?.text,
    ).toMatch(/^Claude unavailable since (\d{1,2} \w{3} )?\d{2}:\d{2} — audits use 3 engines$/);
    // The line links to this workspace's latest audit the outage hit (read as the workspace).
    const { latestAuditHitBy } = await import("@/lib/platform/provider-status");
    expect(await latestAuditHitBy(ORG_ID, "claude", NOW)).toBe(AUDIT_ID);
    expect(await latestAuditHitBy(ORG_ID, "gemini", NOW)).toBeNull();
    expect(await latestAuditHitBy(ORG_ID, "dataforseo", NOW)).toBeNull();
  });

  it("a later Claude answer ends it", async () => {
    await answer("claude", ago(5), 5);
    expect((await status()).outages).toEqual([]);
  });
});
