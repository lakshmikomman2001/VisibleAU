/**
 * 13 Nov (Sri's walk-through, part 13) -- real DB: /admin/settings listed audit #44's Google failures one
 * identical row per question, and only the latest 10 of its 26, silently. The loader now gives one line per
 * audit and answer (code and message), counted per surface, with each question behind it, the latest groups
 * first, and how many there are in all.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const LOGIN_AUDIT_ID = randomUUID();
const TIMEOUT_AUDIT_ID = randomUUID();
// 19 Nov: two later Google runs -- #45 clean (every question checked), #46 newer but with a failed question.
const CLEAN_AUDIT_ID = randomUUID();
const DIRTY_AUDIT_ID = randomUUID();
const ORG_NAME = `Error Groups ${ORG_ID.slice(0, 8)}`;
const RAW_40100 =
  "The provider refused the question: 40100 You are not authorized to access this resource.";

let client: ReturnType<typeof postgres>;

async function failure(
  auditId: string,
  surface: string,
  index: number,
  code: number | null,
  reason: string,
  minutesAhead: number,
) {
  // In the future, so these are the latest failures in the shared test DB whatever else is in it.
  await client`
    INSERT INTO google_surface_results (audit_id, organization_id, surface, prompt, prompt_index,
      is_branded_prompt, outcome, provider, attempts, answer_text, cited_links, google_link_count,
      brand_mentioned, mention_verification, cost_usd, cost_source, location_code, location_label,
      device, se_domain, language_code, queue_mode, fetched_at, provider_status_code, outcome_reason,
      updated_at)
    VALUES (${auditId}, ${ORG_ID}, ${surface}, ${`Best plumber question ${index}?`}, ${index}, false,
      'failed', 'dataforseo', 1, null, ${client.json([])}, 0, null, null, 0, 'provider_reported',
      9071744, '2153 NSW', 'desktop', 'google.com.au', 'en', 'standard', now(), ${code}, ${reason},
      now() + make_interval(days => 1, mins => ${minutesAhead}))
  `;
}

/** A question Google answered (or showed nothing for): checked. */
async function outcome(auditId: string, index: number, result: "shown" | "not_shown") {
  await client`
    INSERT INTO google_surface_results (audit_id, organization_id, surface, prompt, prompt_index,
      is_branded_prompt, outcome, provider, attempts, answer_text, cited_links, google_link_count,
      brand_mentioned, mention_verification, cost_usd, cost_source, location_code, location_label,
      device, se_domain, language_code, queue_mode, fetched_at, provider_status_code, outcome_reason)
    VALUES (${auditId}, ${ORG_ID}, 'google_ai_mode', ${`Best plumber question ${index}?`}, ${index}, false,
      ${result}, 'dataforseo', 1, null, ${client.json([])}, 0, null, null, 0, 'provider_reported',
      9071744, '2153 NSW', 'desktop', 'google.com.au', 'en', 'standard', now(), 20000, null)
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`error-groups-${ORG_ID}`}, ${ORG_NAME}, ${`error-groups-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Omega Services', 'omega.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, total_calls)
    VALUES
      (${LOGIN_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 44, 'complete', ${["chatgpt"]}, 13, 1, 13),
      (${TIMEOUT_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 43, 'complete', ${["chatgpt"]}, 13, 1, 13),
      (${CLEAN_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 45, 'complete', ${["chatgpt"]}, 13, 1, 13),
      (${DIRTY_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 46, 'complete', ${["chatgpt"]}, 13, 1, 13)
  `;
  // In the future, so they're the latest runs in the shared test DB whatever else is in it.
  await client`
    INSERT INTO audit_google_surfaces (audit_id, organization_id, surfaces, settings, status, created_at, completed_at)
    VALUES
      (${CLEAN_AUDIT_ID}, ${ORG_ID}, ${["google_ai_mode"]}, ${client.json({})}, 'complete',
        now() + interval '20 days', now() + interval '20 days 10 minutes'),
      (${DIRTY_AUDIT_ID}, ${ORG_ID}, ${["google_ai_mode"]}, ${client.json({})}, 'complete',
        now() + interval '21 days', now() + interval '21 days 10 minutes')
  `;
  for (let i = 0; i < 2; i++) await outcome(CLEAN_AUDIT_ID, i, i === 0 ? "shown" : "not_shown");
  await outcome(DIRTY_AUDIT_ID, 0, "shown");
  // Its failure the oldest of the fixtures, so audits #44 and #43 stay the latest groups below.
  await failure(DIRTY_AUDIT_ID, "google_ai_mode", 1, null, "No answer from the provider", 1);
  // Audit #44: the login refused on all 13 questions, both answers -- 26 identical failures.
  for (let i = 0; i < 13; i++) {
    await failure(LOGIN_AUDIT_ID, "google_ai_mode", i, 40100, RAW_40100, 10);
    await failure(
      LOGIN_AUDIT_ID,
      "google_ai_overviews",
      i,
      40100,
      RAW_40100,
      10 + (i === 12 ? 1 : 0),
    );
  }
  // Audit #43, earlier: two questions the provider never answered.
  await failure(TIMEOUT_AUDIT_ID, "google_ai_overviews", 0, null, "No answer from the provider", 5);
  await failure(TIMEOUT_AUDIT_ID, "google_ai_overviews", 1, null, "No answer from the provider", 5);
}, 60_000);

afterAll(async () => {
  await client`DELETE FROM google_surface_results WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

const load = async (limit?: number) => {
  const { loadGoogleProviderErrorGroups } = await import("@/lib/audit/google-surfaces/operator");
  return loadGoogleProviderErrorGroups(limit);
};

describe("Provider errors: one line per audit and answer", () => {
  it("audit #44's 26 failures are one group: AI Mode ×13, AI Overviews ×13, each question behind it", async () => {
    const { groups } = await load();
    const [first, second] = groups;
    expect(first).toMatchObject({
      auditNumber: 44,
      brand: "Omega Services",
      workspace: ORG_NAME,
      code: 40100,
      category: "login rejected",
      message: RAW_40100,
      surfaces: [
        { surface: "AI Mode", count: 13 },
        { surface: "AI Overviews", count: 13 },
      ],
    });
    expect(first?.rows).toHaveLength(26);
    expect(new Set(first?.rows.map((r) => r.prompt)).size).toBe(13);
    // The latest of the group's failures.
    const latest = Math.max(...(first?.rows ?? []).map((r) => Date.parse(r.at)));
    expect(first?.at).toBe(new Date(latest).toISOString());
    // Then audit #43's, a group of its own.
    expect(second).toMatchObject({
      auditNumber: 43,
      code: null,
      category: "timed out",
      surfaces: [{ surface: "AI Overviews", count: 2 }],
    });
  });

  it("19 Nov: the last clean run is the latest with every question checked -- not a newer one that failed one", async () => {
    const { loadLastCleanGoogleRun } = await import("@/lib/audit/google-surfaces/operator");
    const run = await loadLastCleanGoogleRun();
    expect(run).toMatchObject({
      auditNumber: 45,
      brand: "Omega Services",
      questions: 2,
      checked: 2,
    });
    const [stored] = await client`
      SELECT created_at, completed_at FROM audit_google_surfaces WHERE audit_id = ${CLEAN_AUDIT_ID}
    `;
    expect(run?.startedAt).toBe(new Date(stored.created_at).toISOString());
    expect(run?.at).toBe(new Date(stored.completed_at).toISOString());
  });

  it("capped, and it says so: the latest group of at least 2, with the total", async () => {
    const { groups, total } = await load(1);
    expect(groups.map((g) => g.auditNumber)).toEqual([44]);
    expect(total).toBeGreaterThanOrEqual(2);
    const all = await load(1000);
    expect(all.total).toBe(total);
    expect(all.groups).toHaveLength(total);
  });
});
