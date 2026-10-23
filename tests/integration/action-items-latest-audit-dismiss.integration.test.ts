/**
 * "The Action Center shows each brand's latest audit only" (23 Oct),
 * item 1 -- real-DB proof for:
 *  1. persistRecommendations (lib/recommendations/persist.ts, the ONE
 *     shared helper both inngest/functions/generate-recommendations.ts
 *     and lib/audit/run-audit-inline.ts now call) dismisses a brand's
 *     older open items the moment a new audit's recommendations are
 *     persisted, leaves in_progress/done alone, skips creating a
 *     duplicate open copy of an in_progress key, is idempotent on
 *     replay, and still dismisses even when the new audit triggered
 *     zero recommendations.
 *  2. latestCompleteAuditIdsByBrand (lib/recommendations/latest-audit-
 *     scope.ts) returns nothing for a brand with no complete audit,
 *     and only the single latest complete audit's id for a brand with
 *     several.
 *  3. SQL parity -- db/prod-fixes/0096-action-items-latest-audit-
 *     dismiss-run2-apply.sql's dismiss-candidate predicate selects
 *     EXACTLY the same action_items rows the application's own
 *     latest-audit rule would, on the same fixture data.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";
import type { RecommendationWithConfidence } from "@/lib/recommendations/types";

const ORG_ID = randomUUID();

const BRAND_DISMISS_ID = randomUUID();
const AUDIT_A1 = randomUUID();
const AUDIT_A2 = randomUUID();
const AUDIT_A3 = randomUUID();
const ITEM_OPEN_ID = randomUUID();
const ITEM_INPROGRESS_ID = randomUUID();
const ITEM_DONE_ID = randomUUID();

const BRAND_NO_COMPLETE_ID = randomUUID();
const AUDIT_NC1 = randomUUID();

const BRAND_MULTI_ID = randomUUID();
const AUDIT_M1 = randomUUID();
const AUDIT_M2 = randomUUID();
const AUDIT_M3 = randomUUID();
const ITEM_M1_OPEN_ID = randomUUID();
const ITEM_M2_OPEN_ID = randomUUID();
const ITEM_M3_OPEN_ID = randomUUID();

const ALL_BRAND_IDS = [BRAND_DISMISS_ID, BRAND_NO_COMPLETE_ID, BRAND_MULTI_ID];

let client: ReturnType<typeof postgres>;
let persistRecommendations: typeof import("@/lib/recommendations/persist").persistRecommendations;
let latestCompleteAuditIdsByBrand: typeof import("@/lib/recommendations/latest-audit-scope").latestCompleteAuditIdsByBrand;
let withRlsContext: typeof import("@/db/client").withRlsContext;

function rec(
  recommendationKey: string,
  overrides: Partial<RecommendationWithConfidence> = {},
): RecommendationWithConfidence {
  return {
    recommendationKey,
    dimension: "frequency",
    title: `Title for ${recommendationKey}`,
    action: "Do the thing.",
    expectedImpactScore: "high",
    evidenceRefs: [],
    confidenceBasis: "inferred",
    confidenceLabel: "likely",
    ...overrides,
  };
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  ({ persistRecommendations } = await import("@/lib/recommendations/persist"));
  ({ latestCompleteAuditIdsByBrand } = await import("@/lib/recommendations/latest-audit-scope"));
  ({ withRlsContext } = await import("@/db/client"));

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`latest-audit-${ORG_ID}`}, 'Latest Audit Scope Test Org', ${`latest-audit-org-${ORG_ID}`})
  `;

  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES
      (${BRAND_DISMISS_ID}, ${ORG_ID}, 'Dismiss and Dedup Brand', 'dismiss-dedup.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney']),
      (${BRAND_NO_COMPLETE_ID}, ${ORG_ID}, 'No Complete Audit Brand', 'no-complete.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney']),
      (${BRAND_MULTI_ID}, ${ORG_ID}, 'Multi Audit Brand', 'multi-audit.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;

  // Dismiss & dedup brand -- 3 complete audits, days apart.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at)
    VALUES
      (${AUDIT_A1}, ${BRAND_DISMISS_ID}, ${ORG_ID}, 1, 'complete', ${["chatgpt"]}, 1, 1, '2026-10-01T00:00:00Z'),
      (${AUDIT_A2}, ${BRAND_DISMISS_ID}, ${ORG_ID}, 2, 'complete', ${["chatgpt"]}, 1, 1, '2026-10-08T00:00:00Z'),
      (${AUDIT_A3}, ${BRAND_DISMISS_ID}, ${ORG_ID}, 3, 'complete', ${["chatgpt"]}, 1, 1, '2026-10-15T00:00:00Z')
  `;
  await client`
    INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, status)
    VALUES
      (${ITEM_OPEN_ID}, ${ORG_ID}, ${BRAND_DISMISS_ID}, ${AUDIT_A1}, 'directory-visibility', 'frequency', 'Old open item', 'Do it.', 'likely', 'high', 'open'),
      (${ITEM_INPROGRESS_ID}, ${ORG_ID}, ${BRAND_DISMISS_ID}, ${AUDIT_A1}, 'entity-profiles', 'frequency', 'In-progress item', 'Do it.', 'likely', 'medium', 'in_progress'),
      (${ITEM_DONE_ID}, ${ORG_ID}, ${BRAND_DISMISS_ID}, ${AUDIT_A1}, 'stale-content', 'accuracy', 'Done item', 'Did it.', 'likely', 'low', 'done')
  `;

  // No-complete-audit brand -- one audit, never completed.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at)
    VALUES (${AUDIT_NC1}, ${BRAND_NO_COMPLETE_ID}, ${ORG_ID}, 4, 'running', ${["chatgpt"]}, 1, 1, NULL)
  `;
  await client`
    INSERT INTO action_items (organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, status)
    VALUES (${ORG_ID}, ${BRAND_NO_COMPLETE_ID}, ${AUDIT_NC1}, 'directory-visibility', 'frequency', 'Open item on a never-completed audit', 'Do it.', 'likely', 'high', 'open')
  `;

  // Multi-audit brand -- 3 complete audits, one open item per audit
  // (for latestCompleteAuditIdsByBrand + SQL-parity checks).
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at)
    VALUES
      (${AUDIT_M1}, ${BRAND_MULTI_ID}, ${ORG_ID}, 5, 'complete', ${["chatgpt"]}, 1, 1, '2026-09-01T00:00:00Z'),
      (${AUDIT_M2}, ${BRAND_MULTI_ID}, ${ORG_ID}, 6, 'complete', ${["chatgpt"]}, 1, 1, '2026-09-15T00:00:00Z'),
      (${AUDIT_M3}, ${BRAND_MULTI_ID}, ${ORG_ID}, 7, 'complete', ${["chatgpt"]}, 1, 1, '2026-10-01T00:00:00Z')
  `;
  await client`
    INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, status)
    VALUES
      (${ITEM_M1_OPEN_ID}, ${ORG_ID}, ${BRAND_MULTI_ID}, ${AUDIT_M1}, 'directory-visibility', 'frequency', 'M1 open', 'Do it.', 'likely', 'high', 'open'),
      (${ITEM_M2_OPEN_ID}, ${ORG_ID}, ${BRAND_MULTI_ID}, ${AUDIT_M2}, 'wikipedia-article', 'frequency', 'M2 open', 'Do it.', 'likely', 'medium', 'open'),
      (${ITEM_M3_OPEN_ID}, ${ORG_ID}, ${BRAND_MULTI_ID}, ${AUDIT_M3}, 'stale-content', 'accuracy', 'M3 open', 'Do it.', 'likely', 'low', 'open')
  `;
}, 30000);

afterAll(async () => {
  await client`DELETE FROM action_items WHERE brand_id = ANY(${ALL_BRAND_IDS})`;
  await client`DELETE FROM audits WHERE brand_id = ANY(${ALL_BRAND_IDS})`;
  await client`DELETE FROM brands WHERE id = ANY(${ALL_BRAND_IDS})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("persistRecommendations -- dismiss, dedup, idempotency, zero-recommendations (item 1)", () => {
  it("dismisses the brand's older open items, leaves in_progress/done alone, and skips a duplicate of an in-progress key", async () => {
    const result = await withRlsContext(ORG_ID, (tx) =>
      persistRecommendations(tx, {
        auditId: AUDIT_A2,
        organizationId: ORG_ID,
        brandId: BRAND_DISMISS_ID,
        recommendations: [rec("directory-visibility"), rec("entity-profiles")],
      }),
    );

    expect(result).toEqual({ inserted: 1, skippedInProgressKeys: ["entity-profiles"], dismissed: 1 });

    const [openItem] = await client`SELECT status, dismissed_reason, dismissed_at FROM action_items WHERE id = ${ITEM_OPEN_ID}`;
    expect(openItem.status).toBe("dismissed");
    expect(openItem.dismissed_reason).toBe("Replaced by a newer audit");
    expect(openItem.dismissed_at).not.toBeNull();

    const [inProgressItem] = await client`SELECT status, dismissed_at FROM action_items WHERE id = ${ITEM_INPROGRESS_ID}`;
    expect(inProgressItem.status).toBe("in_progress");
    expect(inProgressItem.dismissed_at).toBeNull();

    const [doneItem] = await client`SELECT status, dismissed_at FROM action_items WHERE id = ${ITEM_DONE_ID}`;
    expect(doneItem.status).toBe("done");
    expect(doneItem.dismissed_at).toBeNull();

    const newOpenRows = await client`
      SELECT recommendation_key, status FROM action_items
      WHERE audit_id = ${AUDIT_A2} AND brand_id = ${BRAND_DISMISS_ID}
    `;
    expect(newOpenRows).toHaveLength(1);
    expect(newOpenRows[0].recommendation_key).toBe("directory-visibility");
    expect(newOpenRows[0].status).toBe("open");

    const entityProfileRows = await client`
      SELECT id FROM action_items WHERE brand_id = ${BRAND_DISMISS_ID} AND recommendation_key = 'entity-profiles'
    `;
    expect(entityProfileRows.map((r) => r.id)).toEqual([ITEM_INPROGRESS_ID]);
  });

  it("is idempotent on replay -- persisting the same audit's recommendations again inserts and dismisses nothing new", async () => {
    const result = await withRlsContext(ORG_ID, (tx) =>
      persistRecommendations(tx, {
        auditId: AUDIT_A2,
        organizationId: ORG_ID,
        brandId: BRAND_DISMISS_ID,
        recommendations: [rec("directory-visibility"), rec("entity-profiles")],
      }),
    );

    expect(result).toEqual({ inserted: 0, skippedInProgressKeys: ["entity-profiles"], dismissed: 0 });

    const directoryRows = await client`
      SELECT id FROM action_items WHERE audit_id = ${AUDIT_A2} AND recommendation_key = 'directory-visibility'
    `;
    expect(directoryRows).toHaveLength(1);
  });

  it("still dismisses older opens when the new audit triggers zero recommendations", async () => {
    const result = await withRlsContext(ORG_ID, (tx) =>
      persistRecommendations(tx, {
        auditId: AUDIT_A3,
        organizationId: ORG_ID,
        brandId: BRAND_DISMISS_ID,
        recommendations: [],
      }),
    );

    expect(result).toEqual({ inserted: 0, skippedInProgressKeys: [], dismissed: 1 });

    const [a2DirectoryItem] = await client`
      SELECT status, dismissed_reason FROM action_items WHERE audit_id = ${AUDIT_A2} AND recommendation_key = 'directory-visibility'
    `;
    expect(a2DirectoryItem.status).toBe("dismissed");
    expect(a2DirectoryItem.dismissed_reason).toBe("Replaced by a newer audit");

    const [inProgressItem] = await client`SELECT status FROM action_items WHERE id = ${ITEM_INPROGRESS_ID}`;
    expect(inProgressItem.status).toBe("in_progress");
    const [doneItem] = await client`SELECT status FROM action_items WHERE id = ${ITEM_DONE_ID}`;
    expect(doneItem.status).toBe("done");
  });
});

describe("latestCompleteAuditIdsByBrand (item 1)", () => {
  it("returns nothing for a brand with no complete audit", async () => {
    const ids = await withRlsContext(ORG_ID, (tx) => latestCompleteAuditIdsByBrand(tx, ORG_ID));
    expect(ids).not.toContain(AUDIT_NC1);
  });

  it("returns only the single latest complete audit's id for a brand with several", async () => {
    const ids = await withRlsContext(ORG_ID, (tx) => latestCompleteAuditIdsByBrand(tx, ORG_ID));
    expect(ids).toContain(AUDIT_M3);
    expect(ids).not.toContain(AUDIT_M1);
    expect(ids).not.toContain(AUDIT_M2);
  });
});

describe("SQL parity -- prod-fix 0096 vs. the application's latest-audit rule (item 1)", () => {
  it("the prod-fix's dismiss-candidate predicate selects exactly the same rows the app's own rule would, on the same data", async () => {
    // The SAME CTE as db/prod-fixes/0096-action-items-latest-audit-
    // dismiss-run2-apply.sql, scoped to this test's own brands so a
    // pre-existing shared fixture row elsewhere in the test DB can
    // never change the comparison.
    const latestCompletePairs = await client<{ brand_id: string; audit_id: string }[]>`
      SELECT DISTINCT ON (brand_id) brand_id, id AS audit_id
      FROM audits
      WHERE status = 'complete' AND brand_id = ANY(${ALL_BRAND_IDS})
      ORDER BY brand_id, completed_at DESC, id DESC
    `;

    const tsLatestIds = await withRlsContext(ORG_ID, (tx) => latestCompleteAuditIdsByBrand(tx, ORG_ID));
    const scopedTsLatestIds = tsLatestIds.filter((id) =>
      latestCompletePairs.some((p) => p.audit_id === id),
    );
    expect(new Set(scopedTsLatestIds)).toEqual(new Set(latestCompletePairs.map((p) => p.audit_id)));

    const sqlDismissRows = await client<{ id: string }[]>`
      SELECT ai.id
      FROM action_items ai
      JOIN (
        SELECT DISTINCT ON (brand_id) brand_id, id AS audit_id
        FROM audits
        WHERE status = 'complete' AND brand_id = ANY(${ALL_BRAND_IDS})
        ORDER BY brand_id, completed_at DESC, id DESC
      ) lc ON lc.brand_id = ai.brand_id
      WHERE ai.status = 'open'
        AND ai.audit_id <> lc.audit_id
        AND ai.brand_id = ANY(${ALL_BRAND_IDS})
    `;
    const sqlDismissIds = new Set(sqlDismissRows.map((r) => r.id));

    const latestByBrand = new Map(latestCompletePairs.map((p) => [p.brand_id, p.audit_id]));
    const allItems = await client<
      { id: string; brand_id: string; audit_id: string; status: string }[]
    >`
      SELECT id, brand_id, audit_id, status FROM action_items WHERE brand_id = ANY(${ALL_BRAND_IDS})
    `;
    const jsDismissIds = new Set(
      allItems
        .filter(
          (i) =>
            i.status === "open" &&
            latestByBrand.has(i.brand_id) &&
            i.audit_id !== latestByBrand.get(i.brand_id),
        )
        .map((i) => i.id),
    );

    expect(sqlDismissIds).toEqual(jsDismissIds);
    // Non-empty on this fixture -- a passing empty-set comparison would
    // prove nothing; M1's and M2's open items (superseded by M3) must
    // actually appear on both sides.
    expect(sqlDismissIds.size).toBeGreaterThan(0);
    expect(sqlDismissIds.has(ITEM_M1_OPEN_ID)).toBe(true);
    expect(sqlDismissIds.has(ITEM_M2_OPEN_ID)).toBe(true);
    expect(sqlDismissIds.has(ITEM_M3_OPEN_ID)).toBe(false);
  });
});
