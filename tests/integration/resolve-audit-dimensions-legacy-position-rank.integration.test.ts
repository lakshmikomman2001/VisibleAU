/**
 * Vunnara (21 Oct), item 1 -- the hotfix's own named regression test.
 * Production audit #30 (Omega Services) stored `citations.position`
 * values written by the OLD character-offset heuristic (pre-a093ceb):
 * ChatGPT's 4th-listed mention came out as 33, its 8th as 53;
 * Perplexity's 1st/2nd/3rd bullets came out as 4/8/14, its 8th as 17.
 * None of those numbers are list ranks. This fixture reproduces that
 * exact shape -- the stored `position` column below is deliberately
 * the wrong, legacy number for every row -- and proves
 * resolveAuditDimensionsAndHeadline never reads it: the real rank
 * comes only from extractListRank reading each row's own response
 * text at read time, regardless of what `position` says.
 *
 * ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withRlsContext } from "@/db/client";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const ENGINES = ["chatgpt", "chatgpt", "chatgpt", "perplexity", "perplexity", "perplexity"];

let client: ReturnType<typeof postgres>;

// Legacy, WRONG stored position (character-offset heuristic) paired
// with real response text whose own list marker gives the true rank.
const ROWS: { legacyPosition: number; realRank: number; snippet: string }[] = [
  { legacyPosition: 33, realRank: 4, snippet: "4. Omega Services is a trusted local plumber." },
  { legacyPosition: 53, realRank: 8, snippet: "8. Omega Services also serves the area." },
  { legacyPosition: 4, realRank: 1, snippet: "1. Omega Services is highly rated nearby." },
  { legacyPosition: 8, realRank: 2, snippet: "2. Omega Services has strong local reviews." },
  { legacyPosition: 14, realRank: 3, snippet: "3. Omega Services is a solid choice too." },
  { legacyPosition: 17, realRank: 8, snippet: "8. Omega Services rounds out the list." },
];

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${ORG_ID}, ${`lpr-${ORG_ID}`}, 'Legacy Position Rank Org', ${`lpr-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Omega Services', 'omegaservices.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 30, 'complete', ${ENGINES}, 6, 1, now(),
      16.22, 16.22, 71.0, 80, 80, 100)
  `;
  for (let i = 0; i < ROWS.length; i++) {
    await client`
      INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, position, cited_sources, response_snippet)
      VALUES (${AUDIT_ID}, ${ENGINES[i]}, ${`organic prompt ${i}`}, 1, true, false, ${ROWS[i].legacyPosition},
        ${client.json([])}, ${ROWS[i].snippet})
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

describe("resolveAuditDimensionsAndHeadline -- never trusts the legacy stored citations.position", () => {
  it("audit #30's own shape: legacy offsets (33,53,4,8,14,17) are ignored; real ranks (4,8,1,2,3,8) drive the median", async () => {
    const { dimensions, mentionedCount, rankedCount, medianPosition } = await withRlsContext(
      ORG_ID,
      (tx) => resolveAuditDimensionsAndHeadline(tx, AUDIT_ID),
    );

    // All 6 organic rows mentioned, and every one of them landed on a
    // real numbered line -- "6 of 6 mentions listed" in the card's text.
    expect(mentionedCount).toBe(6);
    expect(rankedCount).toBe(6);

    // Real ranks [4,8,1,2,3,8] sorted -> [1,2,3,4,8,8] -> median (3+4)/2
    // = 3.5 -> displayed, rounded, as "Average #4". Nowhere does this
    // equal a computation over the stored legacy column (which would
    // sort to [4,8,14,17,33,53], median 15.5 -- a completely different,
    // wrong number this test would also catch).
    expect(medianPosition).toBe(3.5);
    expect(Math.round(medianPosition as number)).toBe(4);

    expect(dimensions.position.status).toBe("scored");

    // The corrected audit #30 card's "When you're mentioned" subtext
    // (app/(auth)/audits/[auditId]/page.tsx): "Average #N when listed
    // (k of m mention(s) listed)".
    const subtext = `Average #${Math.round(medianPosition as number)} when listed (${rankedCount} of ${mentionedCount} mention(s) listed)`;
    expect(subtext).toBe("Average #4 when listed (6 of 6 mention(s) listed)");
  });
});
