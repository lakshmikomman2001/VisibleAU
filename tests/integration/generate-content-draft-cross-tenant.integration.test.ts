/**
 * Task #46 (14th follow-up) -- RED->GREEN for a concrete finding from the
 * serviceDb audit: generateContentDraft() looked up `remediationTasks` by
 * `taskId` alone (event.data, originating from the request body of
 * app/api/brands/[brandId]/drafts/route.ts -- validated only as a
 * well-formed UUID, never checked to belong to the caller's own
 * brand/org). Proven here against real Postgres: a task that genuinely
 * belongs to a DIFFERENT org must never be readable by sending its id
 * alongside a different org/brand pair.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateContentDraft } from "@/inngest/functions/generate-content-draft";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_A_ID = randomUUID();
const ORG_B_ID = randomUUID();
const BRAND_A_ID = randomUUID();
const BRAND_B_ID = randomUUID();
const TASK_B_ID = randomUUID(); // belongs to org B / brand B only
const TASK_B_TITLE = `CROSS-TENANT-SECRET-${randomUUID()}`;

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  client = postgres(getTestDatabaseUrl(), { max: 1 });

  for (const [id, name] of [
    [ORG_A_ID, "Content-Draft Org A"],
    [ORG_B_ID, "Content-Draft Org B"],
  ] as const) {
    await client`
      INSERT INTO organizations (id, clerk_org_id, name, tier, region)
      VALUES (${id}, ${"cd-" + id}, ${name}, 'free', 'au')
    `;
  }

  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES
      (${BRAND_A_ID}, ${ORG_A_ID}, 'Brand A', ${"cd-a-" + randomUUID() + ".example.com"}, 'tradies', 'au', ARRAY['NSW:Sydney']),
      (${BRAND_B_ID}, ${ORG_B_ID}, 'Brand B', ${"cd-b-" + randomUUID() + ".example.com"}, 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;

  await client`
    INSERT INTO remediation_tasks (id, organization_id, brand_id, recommendation_key, dimension, title, confidence_label, status, priority)
    VALUES (${TASK_B_ID}, ${ORG_B_ID}, ${BRAND_B_ID}, 'test_key', 'test_dimension', ${TASK_B_TITLE}, 'high', 'open', 1)
  `;
});

afterAll(async () => {
  await client`DELETE FROM content_drafts WHERE brand_id IN (${BRAND_A_ID}, ${BRAND_B_ID})`;
  await client`DELETE FROM remediation_tasks WHERE id = ${TASK_B_ID}`;
  await client`DELETE FROM brands WHERE id IN (${BRAND_A_ID}, ${BRAND_B_ID})`;
  await client`DELETE FROM organizations WHERE id IN (${ORG_A_ID}, ${ORG_B_ID})`;
  await client.end();
});

function runHandler(data: { taskId: string; brandId: string; orgId: string }) {
  // Call the Inngest function's own handler directly (bypassing the
  // Inngest runtime/step wrapper, which this function doesn't actually
  // use step.run for) -- same pattern as calling any other plain async
  // function under test.
  type Handler = (ctx: { event: { data: typeof data } }) => Promise<{ draftId: string }>;
  return (generateContentDraft as unknown as { fn: Handler }).fn({ event: { data } });
}

describe("generateContentDraft() -- a task belonging to a DIFFERENT org/brand must never be readable", () => {
  it("org A sending org B's real taskId gets 'Task not found', not org B's content", async () => {
    await expect(
      runHandler({ taskId: TASK_B_ID, brandId: BRAND_A_ID, orgId: ORG_A_ID }),
    ).rejects.toThrow(`Task not found: ${TASK_B_ID}`);

    const drafts = await client`SELECT title, body FROM content_drafts WHERE brand_id = ${BRAND_A_ID}`;
    expect(drafts.every((d) => !d.title?.includes(TASK_B_TITLE) && !d.body?.includes(TASK_B_TITLE))).toBe(
      true,
    );
  });

  it("org B requesting its OWN task succeeds normally", async () => {
    const result = await runHandler({ taskId: TASK_B_ID, brandId: BRAND_B_ID, orgId: ORG_B_ID });
    expect(result.draftId).toBeTruthy();

    const [draft] = await client`SELECT title FROM content_drafts WHERE id = ${result.draftId}`;
    expect(draft.title).toBe(TASK_B_TITLE);
  });
});
