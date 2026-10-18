/**
 * Vunnara Build 1, Part F.3 -- real-DB proof that the Wins Feed's
 * "new_citation" win never surfaces the same mention multiple times
 * for a historical audit that predates Part F.1's replay-loop
 * removal. Before this fix, findNewCitations had no run_number
 * filter, so an old audit with 5 identical replay rows per real
 * mention could show the same win 5 times in the latest-5 feed.
 *
 * ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`wfrn-${ORG_ID}`}, 'Wins Feed Run Number Org', ${`wfrn-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'WF Run Number Co', 'wf-run-number.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, completed_at)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'complete', NOW())
  `;

  // Legacy-shaped audit: one real mention (run_number=1) plus 4 byte-
  // identical cache replays (run_number 2-5), exactly the shape a
  // pre-Part-F.1 audit at runsPerPrompt=5 would have written.
  for (let run = 1; run <= 5; run++) {
    await client`
      INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
      VALUES (${AUDIT_ID}, 'chatgpt', 'Best plumber in Sydney?', ${run}, true, false, ${client.json([])}, 'Response text')
    `;
  }
});

afterAll(async () => {
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("getWinsFeed -- new_citation wins never multiply for a replay-inflated historical audit", () => {
  it("surfaces exactly one new_citation win for 5 identical replay rows, not 5", async () => {
    const { getWinsFeed } = await import("@/lib/communication/wins-feed");
    const { db } = await import("@/db/client");

    const wins = await db.transaction((tx) => getWinsFeed(tx, BRAND_ID, { limit: 20 }));
    const newCitationWins = wins.filter((w) => w.type === "new_citation");
    expect(newCitationWins).toHaveLength(1);
  });
});
