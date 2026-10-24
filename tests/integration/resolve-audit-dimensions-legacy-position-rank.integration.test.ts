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
// Vunnara (21 Oct, addendum): the two ChatGPT snippets are the actual
// diag-0082 response_text excerpts, verbatim -- bold-numbered markdown,
// the trailing double-space hard line break, and (for the 8th) the
// "---" section divider ChatGPT put before it. Plain numbered lines
// never exercised the markdown-wrapped-numbering bug that shipped in
// c05beff (both ChatGPT ranks silently came back null); this fixture
// does.
const ROWS: { legacyPosition: number; realRank: number; snippet: string }[] = [
  {
    legacyPosition: 33,
    realRank: 4,
    snippet:
      "**4. Omega Services**  \n" +
      "- Based in Norwest (Suite 6964, 26 Brookhollow Avenue), licensed (Licence No. 361573C), ...",
  },
  {
    legacyPosition: 53,
    realRank: 8,
    snippet:
      "---\n" +
      "\n" +
      "**8. Omega Services**  \n" +
      "- Located in Norwest, this provider offers plumbing, electrical, hot water, and drain services. ...",
  },
  {
    legacyPosition: 4,
    realRank: 1,
    snippet: "- **Omega Services** — Licensed and insured, NSW licence **361573C**; ranked 1st.",
  },
  {
    legacyPosition: 8,
    realRank: 2,
    snippet:
      "- A Local Competitor — a well-reviewed alternative.\n- **Omega Services** — has strong local reviews.",
  },
  {
    legacyPosition: 14,
    realRank: 3,
    snippet:
      "- A Local Competitor — a well-reviewed alternative.\n" +
      "- Another Competitor — also well regarded.\n" +
      "- **Omega Services** — a solid choice too.",
  },
  {
    legacyPosition: 17,
    realRank: 8,
    snippet: (() => {
      const lines: string[] = [];
      for (let i = 1; i <= 7; i++) lines.push(`- Provider ${i} — a reputable local option.`);
      lines.push("- **Omega Services** — rounds out the list.");
      return lines.join("\n");
    })(),
  },
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
    // = 3.5 -> displayed, rounded, as "Typically #4" (Vunnara, push-check
    // follow-up: "Average" was dropped because the number shown really
    // is the median, matching positionDimensionScore's own formula --
    // the arithmetic mean of these same 6 ranks is ~4.33, which rounds
    // to the same "#4" for THIS audit by coincidence, but is a different
    // statistic from what the 0-100 score bar next to this text is
    // actually computed from). Nowhere does this equal a computation
    // over the stored legacy column (which would sort to
    // [4,8,14,17,33,53], median 15.5 -- a completely different, wrong
    // number this test would also catch).
    expect(medianPosition).toBe(3.5);
    expect(Math.round(medianPosition as number)).toBe(4);

    // Audit #36 follow-up: no 0-100 value -- the Position card shows the
    // median rank itself, both ranks when it falls between two.
    expect(dimensions.position).toEqual({ status: "not_measured", reason: "counts_only" });
    const { positionCard } = await import("@/lib/scoring/measured-display");
    expect(
      positionCard({ mentionedCount, rankedCount, medianPosition, sourcedCount: 0 }),
    ).toMatchObject({ value: "#3–4", detail: "6 of 6 mentions were in a ranked list" });
  });
});
