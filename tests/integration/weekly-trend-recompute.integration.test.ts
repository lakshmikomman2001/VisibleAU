/**
 * Leftovers task, part 6 (17 Nov; Sri's production check of 16 Nov): "Hero's 2026-W46 row was last calculated
 * 2026-11-12 10:26 UTC (just after #46) and not after #47, #48, #50, nor when #46 was excluded."
 *
 * Two causes, both covered here: the week's row recomputed on every audit.complete and every exclusion, but its
 * calculated_at was set only when the row was first made (the upsert bumped updated_at), so a recomputed week still
 * read "calculated 12 Nov"; and scheduled, bulk, workflow and validation audits sent no audit.complete at all (part 2,
 * tests/integration/scheduled-audit-follow-ups.integration.test.ts). Each completed audit and each exclusion now
 * updates its week, and calculated_at says when.
 *
 * Real DB: a brand with two complete audits in one ISO week; the trend function's own handler on audit.complete,
 * then /admin/audits' exclusion.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG = randomUUID();
const BRAND = randomUUID();
const AUDIT_1 = randomUUID();
const AUDIT_2 = randomUUID();
// A Wednesday and a Friday of one ISO week (2026-W46), in UTC.
const MONDAY = new Date("2026-11-09T00:00:00Z");
const WEDNESDAY = new Date("2026-11-11T03:00:00Z");
const FRIDAY = new Date("2026-11-13T03:00:00Z");

let client: ReturnType<typeof postgres>;

type Handler = (ctx: {
  event: { data: Record<string, unknown> };
  step: unknown;
}) => Promise<unknown>;
const step = { run: async (_id: string, fn: () => unknown) => fn() };

async function aggregateOnComplete(auditId: string) {
  const { inngest } = await import("@/lib/inngest/client");
  const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);
  const { aggregateVisibilityTrendFn } = await import(
    "@/inngest/functions/aggregate-visibility-trend"
  );
  await (aggregateVisibilityTrendFn as unknown as { fn: Handler }).fn({
    event: { data: { auditId, brandId: BRAND, organizationId: ORG } },
    step,
  });
  send.mockRestore();
}

async function weekRow() {
  const [row] = await client<
    {
      audit_count: number;
      calculated_at: Date;
      updated_at: Date;
      score_composite_avg: string | null;
    }[]
  >`
    SELECT audit_count, calculated_at, updated_at, score_composite_avg
    FROM visibility_trends WHERE brand_id = ${BRAND} AND period_type = 'weekly' AND period_label = '2026-W46'
  `;
  return row;
}

async function seedAudit(id: string, n: number, completedAt: Date | null, mentioned: number) {
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, completed_at,
      engines, engine_count, prompts_count, runs_per_prompt, total_calls, methodology_version, question_set_hash)
    VALUES (${id}, ${BRAND}, ${ORG}, ${n}, 'schedule', ${completedAt ? "complete" : "running"}, ${completedAt},
      ARRAY['chatgpt']::text[], 1, 10, 1, 10, 4, 'same-questions')
  `;
  for (let i = 0; i < 10; i++) {
    await client`
      INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned,
        mention_verification, is_branded_prompt, response_text, llm_model)
      VALUES (${id}, 'chatgpt', ${`Who is a reliable plumber near Bondi? (${i})`}, ${i}, 1, ${i < mentioned},
        ${i < mentioned ? "verified_domain" : null}, false, 'answer', 'gpt-test')
    `;
  }
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`trend-recompute-${ORG}`}, 'Trend Recompute Test Org', ${`trend-recompute-${ORG}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region)
    VALUES (${BRAND}, ${ORG}, 'Wren Home Services', 'herohome.com.au', 'tradies', 'au')
  `;
  await seedAudit(AUDIT_1, 1, WEDNESDAY, 3);
  // The second audit is still running; it completes in the second test.
  await seedAudit(AUDIT_2, 2, null, 5);
}, 60_000);

afterAll(async () => {
  await deleteOrgRows(client, ORG);
  await client.end();
});

describe("each completed audit and each exclusion updates its week", () => {
  it("the first audit makes the week's row", async () => {
    expect(MONDAY.getTime()).toBeLessThan(WEDNESDAY.getTime());
    await aggregateOnComplete(AUDIT_1);
    const row = await weekRow();
    expect(row.audit_count).toBe(1);
  }, 60_000);

  it("the second audit that week recomputes it, and calculated_at says when", async () => {
    const before = await weekRow();
    await new Promise((r) => setTimeout(r, 20));
    await client`UPDATE audits SET status = 'complete', completed_at = ${FRIDAY} WHERE id = ${AUDIT_2}`;
    await aggregateOnComplete(AUDIT_2);
    const after = await weekRow();
    expect(after.audit_count).toBe(2);
    expect(after.calculated_at.getTime()).toBeGreaterThan(before.calculated_at.getTime());
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  }, 60_000);

  it("excluding an audit recomputes its week from the audits left, and calculated_at moves", async () => {
    const before = await weekRow();
    await new Promise((r) => setTimeout(r, 20));
    const { setAuditTrendExclusion } = await import("@/lib/admin/trend-exclusions");
    await setAuditTrendExclusion(AUDIT_2, "Wrong location used for this run", null);
    const after = await weekRow();
    expect(after.audit_count).toBe(1);
    expect(after.calculated_at.getTime()).toBeGreaterThan(before.calculated_at.getTime());
  }, 60_000);
});
