/**
 * Task #46 Phase 3, Part C -- real-DB proof that the public badge route
 * (app/api/badge/route.ts) recomputes its composite live via
 * resolveComposite (lib/scoring/dimension-result.ts), excluding Sentiment
 * and Context, rather than trusting the stored audits.score_composite
 * column -- which was computed back when Sentiment/Context were still
 * fabricated from mention presence at 20%/15% weight and is now stale.
 * RED under the pre-fix code (badge showed the stale 5-dimension blend),
 * GREEN here (badge shows the honest 3-dimension renormalised blend).
 * Real seeded rows in the local test DB (⚠️ DEV/TEST DB ONLY -- never run
 * against visibleau_prod), via getTestDatabaseUrl() + a raw postgres()
 * client -- same pattern as the other Phase 1-3 integration tests.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const ZERO_BRAND_ID = randomUUID();
const MENTIONED_BRAND_ID = randomUUID();
const ZERO_AUDIT_ID = randomUUID();
const MENTIONED_AUDIT_ID = randomUUID();
const ZERO_DOMAIN = "zerobadge.example.com.au";
const MENTIONED_DOMAIN = "mentionedbadge.example.com.au";

const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"];

let client: ReturnType<typeof postgres>;

async function insertCitation(opts: {
  auditId: string;
  engine: string;
  prompt: string;
  brandMentioned: boolean;
  citedSources?: Array<{ url: string }>;
  position?: number | null;
}) {
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet, position)
    VALUES (
      ${opts.auditId}, ${opts.engine}, ${opts.prompt}, 1, ${opts.brandMentioned}, false,
      ${client.json(opts.citedSources ?? [])}, 'A generic response about local trades.', ${opts.position ?? null}
    )
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${ORG_ID}, ${`badge-${ORG_ID}`}, 'Badge Test Org', ${`badge-org-${ORG_ID}`})
  `;

  // --- Zero-mention brand/audit: composite recompute is unaffected (it
  // never runs -- mentionCount === 0 returns insufficient_data early). ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${ZERO_BRAND_ID}, ${ORG_ID}, 'Zero Badge Co', ${ZERO_DOMAIN}, 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${ZERO_AUDIT_ID}, ${ZERO_BRAND_ID}, ${ORG_ID}, 1, 'complete', ${ENGINES}, 2, 1, now(),
      0, 0, 0, 0, 0, 0)
  `;
  for (const engine of ENGINES) {
    for (let p = 0; p < 2; p++) {
      await insertCitation({ auditId: ZERO_AUDIT_ID, engine, prompt: `zero prompt ${p}`, brandMentioned: false });
    }
  }

  // --- Fully-mentioned brand/audit: stored score_* columns are
  // deliberately STALE/WRONG (76.5/100/80/...) -- Vunnara (19 Oct, post-
  // aa83b3a), "the headline is the mention rate": the badge recomputes
  // the headline (Frequency) live, never blended with Position/Source-
  // citation -- 8 of 8 mentioned = 100%, not the stale 77% (the old
  // 5-dimension blend), 81%/88% (earlier fixes that still blended
  // Position/Source-citation in).
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${MENTIONED_BRAND_ID}, ${ORG_ID}, 'Mentioned Badge Co', ${MENTIONED_DOMAIN}, 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${MENTIONED_AUDIT_ID}, ${MENTIONED_BRAND_ID}, ${ORG_ID}, 2, 'complete', ${ENGINES}, 2, 1, now(),
      76.5, 100, 80, 75, 60, 50)
  `;
  let idx = 0;
  for (const engine of ENGINES) {
    for (let p = 0; p < 2; p++) {
      idx++;
      await insertCitation({
        auditId: MENTIONED_AUDIT_ID,
        engine,
        prompt: `mentioned prompt ${p}`,
        brandMentioned: true,
        position: 1,
        citedSources: idx % 2 === 0 ? [{ url: "https://example.com/b" }] : [],
      });
    }
  }
});

afterAll(async () => {
  const auditIds = [ZERO_AUDIT_ID, MENTIONED_AUDIT_ID];
  const brandIds = [ZERO_BRAND_ID, MENTIONED_BRAND_ID];
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ANY(${brandIds})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function callBadge(domain: string): Promise<string> {
  const { GET } = await import("@/app/api/badge/route");
  const req = new Request(`http://localhost/api/badge?domain=${domain}`);
  const res = await GET(req);
  return res.text();
}

describe("badge route — composite recompute excludes Sentiment/Context", () => {
  it("zero-mention brand: still 'Not yet mentioned' (insufficient_data), unaffected by the composite recompute", async () => {
    const svg = await callBadge(ZERO_DOMAIN);
    expect(svg).toContain("Not yet mentioned");
  });

  it("mentioned brand: badge recomputes the mention rate live (100%), not the stale stored composite (77%) or earlier blended fixes (81%/88%)", async () => {
    const svg = await callBadge(MENTIONED_DOMAIN);
    expect(svg).toContain("100%");
    expect(svg).not.toContain("77%");
    expect(svg).not.toContain("81%");
    expect(svg).not.toContain("88%");
  });
});
