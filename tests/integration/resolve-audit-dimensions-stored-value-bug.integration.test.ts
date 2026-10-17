/**
 * Task #46 -- fix: the headline score and Frequency showed a STORED value
 * that contradicts its own read-time CI. Real-DB proof that
 * resolveOrganicDimensions/resolveAuditDimensionsAndComposite
 * (lib/scoring/resolve-audit-dimensions.ts) derive the VALUE from the
 * same `citations` rows the CI and insufficient-data state already come
 * from -- so they can never disagree, unlike the old
 * `Number(audit.scoreFrequency ?? 0)` every reader used to pass as the
 * value while computing CI fresh.
 *
 * Fixture mirrors the real, live bug exactly: Bondi Plumbing Audit #8
 * (prod, 17 Oct) -- stored score_frequency = 44.4 / score_composite =
 * 44.4, but after prod-fix 0066 retroactively flagged its 16 brand-named
 * answers as is_branded_prompt = true, the TRUE organic sample is 20
 * answers (4 engines x 5 runs x 1 prompt... here modelled as a smaller
 * but equivalent organic pool), 0 of them mentioning the brand.
 *
 * ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accuracyDimensionScore } from "@/lib/scoring/accuracy";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";
import { positionDimensionScore } from "@/lib/scoring/position";
import { resolveAuditDimensionsAndComposite } from "@/lib/scoring/resolve-audit-dimensions";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const STALE_AUDIT_ID = randomUUID();
const MENTIONED_AUDIT_ID = randomUUID();
const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"];

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${ORG_ID}, ${`svb-${ORG_ID}`}, 'Stored-vs-bug Org', ${`svb-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Bondi Plumbing (fixture)', 'bondiplumbing.example.com.au', 'tradies', 'au', ARRAY['NSW:Bondi'], ARRAY[]::text[])
  `;
  // The exact live contradiction: a STALE stored 44.4, computed before
  // prod-fix 0066 retroactively reclassified the brand-named answers as
  // branded. Real `citations` rows below are already post-0066 (all
  // organic, zero mentions) -- the same state the live bug is in today.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${STALE_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 8, 'complete', ${ENGINES}, 5, 1, now(),
      44.4, 44.4, 44.4, 44.4, 44.4, 44.4)
  `;
  for (const engine of ENGINES) {
    for (let p = 0; p < 5; p++) {
      await client`
        INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
        VALUES (${STALE_AUDIT_ID}, ${engine}, ${`organic prompt ${p}`}, 1, false, false, ${client.json([])}, 'A generic response about local trades.')
      `;
    }
  }

  // --- Second fixture: real mentions, varied positions and source
  // coverage -- cross-checked against the actual scoring functions
  // (lib/scoring/frequency.ts, position.ts, accuracy.ts) below, not
  // hand-computed, so a formula drift between resolve-audit-dimensions.ts
  // and the real scoring functions would fail this test.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${MENTIONED_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 9, 'complete', ${ENGINES}, 10, 1, now(),
      0, 0, 0, 0, 0, 0)
  `;
  // 10 organic rows: 6 mentioned (positions 1,1,2,3,5,8 -> median 2.5),
  // 4 of the 6 mentioned rows carry a cited source.
  const mentionedPositions = [1, 1, 2, 3, 5, 8];
  for (let i = 0; i < mentionedPositions.length; i++) {
    const hasSource = i < 4;
    await client`
      INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, position, cited_sources, response_snippet)
      VALUES (${MENTIONED_AUDIT_ID}, ${ENGINES[i % ENGINES.length]}, ${`mentioned prompt ${i}`}, 1, true, false, ${mentionedPositions[i]},
        ${client.json(hasSource ? [{ url: "https://example.com/src" }] : [])}, 'Bondi Plumbing is well regarded locally.')
    `;
  }
  for (let i = 0; i < 4; i++) {
    await client`
      INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
      VALUES (${MENTIONED_AUDIT_ID}, ${ENGINES[i % ENGINES.length]}, ${`not-mentioned prompt ${i}`}, 1, false, false, ${client.json([])}, 'A generic response about local trades.')
    `;
  }
});

afterAll(async () => {
  const auditIds = [STALE_AUDIT_ID, MENTIONED_AUDIT_ID];
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("resolveAuditDimensionsAndComposite -- stored-value-contradicts-CI bug", () => {
  it("RED under the old code path (Number(audit.scoreFrequency ?? 0) = 44.4) -- GREEN here: Frequency reads 0.0, not 44.4, matching its own CI and the real organic sample", async () => {
    const { withRlsContext } = await import("@/db/client");
    const { dimensions, composite } = await withRlsContext(ORG_ID, (tx) =>
      resolveAuditDimensionsAndComposite(tx, STALE_AUDIT_ID),
    );

    expect(dimensions.frequency.status).toBe("scored");
    if (dimensions.frequency.status !== "scored") throw new Error("unreachable");
    // This is the exact invariant the live bug violated: the OLD code
    // would have returned value = 44.4 (stored) with ci = [0, X] (fresh)
    // -- 44.4 sitting outside its own [0, X] interval. Here value and CI
    // both come from the same real rows, so value must fall inside ci.
    expect(dimensions.frequency.value).toBe(0);
    expect(dimensions.frequency.value).toBeGreaterThanOrEqual(dimensions.frequency.ci.lower);
    expect(dimensions.frequency.value).toBeLessThanOrEqual(dimensions.frequency.ci.upper);
    expect(dimensions.frequency.ci.upper).toBeGreaterThan(0); // non-degenerate, real Wilson CI

    // Frequency = organic mentioned / organic answers * 100 = 0/20*100 = 0.
    expect(dimensions.frequency.value).toBeCloseTo(0, 5);

    // Position/Accuracy are insufficient_data (0 mentions) -- never the
    // stale stored 44.4 either.
    expect(dimensions.position.status).toBe("insufficient_data");
    expect(dimensions.accuracy.status).toBe("insufficient_data");

    // Composite is frequency_only and equals Frequency's own value -- 0.0,
    // not the stale stored score_composite (44.4).
    expect(composite.basis).toBe("frequency_only");
    expect(composite.value).toBe(0);
    expect(composite.value).not.toBe(44.4);
  });

  it("batched form (resolveOrganicDimensions) gives the identical answer for the same audit id, in one query covering many ids", async () => {
    const { withRlsContext } = await import("@/db/client");
    const { resolveOrganicDimensions } = await import("@/lib/scoring/resolve-audit-dimensions");
    const map = await withRlsContext(ORG_ID, (tx) =>
      resolveOrganicDimensions(tx, [STALE_AUDIT_ID, randomUUID()]),
    );
    const result = map.get(STALE_AUDIT_ID);
    expect(result).toBeDefined();
    expect(result?.frequency.status).toBe("scored");
    if (result?.frequency.status !== "scored") throw new Error("unreachable");
    expect(result.frequency.value).toBe(0);
    // An audit id with zero organic rows at all still gets a real,
    // explicit result (frequency_only/insufficient_data), not a missing
    // map entry a caller could mistake for "not computed yet".
    expect(map.size).toBe(2);
  });

  it("formulas match the real scoring functions exactly -- not reimplemented independently (RED if resolve-audit-dimensions.ts's math ever drifts from frequency.ts/position.ts/accuracy.ts)", async () => {
    const { withRlsContext } = await import("@/db/client");
    const { dimensions } = await withRlsContext(ORG_ID, (tx) =>
      resolveAuditDimensionsAndComposite(tx, MENTIONED_AUDIT_ID),
    );

    // 6 mentioned of 10 organic answers.
    const expectedFrequency = frequencyDimensionScore(6, 10);
    expect(dimensions.frequency.status).toBe("scored");
    if (dimensions.frequency.status !== "scored") throw new Error("unreachable");
    expect(dimensions.frequency.value).toBeCloseTo(expectedFrequency, 5);
    expect(dimensions.frequency.value).toBeGreaterThanOrEqual(dimensions.frequency.ci.lower);
    expect(dimensions.frequency.value).toBeLessThanOrEqual(dimensions.frequency.ci.upper);

    // positions [1,1,2,3,5,8] -> median 2.5, same positionDimensionScore
    // the real audit-completion code uses.
    const expectedPosition = positionDimensionScore([1, 1, 2, 3, 5, 8]);
    expect(dimensions.position.status).toBe("scored");
    if (dimensions.position.status !== "scored") throw new Error("unreachable");
    expect(dimensions.position.value).toBeCloseTo(expectedPosition, 1);
    expect(dimensions.position.value).toBeGreaterThanOrEqual(dimensions.position.ci.lower);
    expect(dimensions.position.value).toBeLessThanOrEqual(dimensions.position.ci.upper);

    // 4 of 6 mentioned rows carry a cited source.
    const expectedAccuracy = accuracyDimensionScore([
      { brandMentioned: true, citedSources: [1] },
      { brandMentioned: true, citedSources: [1] },
      { brandMentioned: true, citedSources: [1] },
      { brandMentioned: true, citedSources: [1] },
      { brandMentioned: true, citedSources: [] },
      { brandMentioned: true, citedSources: [] },
    ]);
    expect(dimensions.accuracy.status).toBe("scored");
    if (dimensions.accuracy.status !== "scored") throw new Error("unreachable");
    expect(dimensions.accuracy.value).toBeCloseTo(expectedAccuracy, 5);
    expect(dimensions.accuracy.value).toBeGreaterThanOrEqual(dimensions.accuracy.ci.lower);
    expect(dimensions.accuracy.value).toBeLessThanOrEqual(dimensions.accuracy.ci.upper);
  });
});
