/**
 * Task #46 Phase 2, Part 1 -- real-DB proof that drift detection's
 * composite comparison (lib/drift/detect.ts + the honest read-time
 * recomputation in inngest/functions/detect-drift.ts's buildDriftInput)
 * never raises drift for a zero-mention ("frequency_only" basis) audit
 * compared against a real prior audit, while still correctly raising
 * drift for two genuinely different, comparable ("weighted" basis)
 * audits. The unit tests in tests/unit/drift/detect.test.ts prove the
 * pure gating logic in isolation; this proves buildDriftInput actually
 * wires real seeded `citations` rows through resolveDimension/
 * resolveComposite into the shape detectDrift needs.
 * ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();

// Scenario A: a zero-mention current audit vs a real, scored previous audit.
const ZERO_AUDIT_ID = randomUUID();
const REAL_PREVIOUS_AUDIT_ID = randomUUID();

// Scenario B: two real, "weighted"-basis audits with a genuine, large
// composite drop -- proves the fix doesn't suppress real drift detection.
const REAL_OLDER_AUDIT_ID = randomUUID();
const REAL_CURRENT_AUDIT_ID = randomUUID();

const ENGINES = ["chatgpt", "claude"];

let client: ReturnType<typeof postgres>;

async function seedCitations(opts: {
  auditId: string;
  sampleCount: number;
  mentionedCount: number;
  accWithSourcesCount: number;
}) {
  for (let i = 0; i < opts.sampleCount; i++) {
    const mentioned = i < opts.mentionedCount;
    const hasSource = mentioned && i < opts.accWithSourcesCount;
    await client`
      INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
      VALUES (
        ${opts.auditId}, ${ENGINES[i % ENGINES.length]}, ${`prompt ${i}`}, 1, ${mentioned}, false,
        ${client.json(hasSource ? [{ url: "https://example.com/src" }] : [])},
        'A generic response about local trades.'
      )
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
    VALUES (${ORG_ID}, ${`ddi-${ORG_ID}`}, 'Drift Insufficient Data Org', ${`ddi-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Drift Test Co', 'drifttest.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;

  // --- Scenario A: previous audit is real (3 of 12 organic mentions). ---
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at, created_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${REAL_PREVIOUS_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 101, 'complete', ${ENGINES}, 6, 1, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days',
      45, 25, 70, 75, 50, 33.33)
  `;
  await seedCitations({
    auditId: REAL_PREVIOUS_AUDIT_ID,
    sampleCount: 12,
    mentionedCount: 3,
    accWithSourcesCount: 1,
  });

  // --- Scenario A: current audit has ZERO mentions -- basis must
  // resolve to "frequency_only". ---
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at, created_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${ZERO_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 102, 'complete', ${ENGINES}, 6, 1, NOW(), NOW(),
      0, 0, 0, 0, 0, 0)
  `;
  await seedCitations({
    auditId: ZERO_AUDIT_ID,
    sampleCount: 12,
    mentionedCount: 0,
    accWithSourcesCount: 0,
  });

  // --- Scenario B: an older, real "weighted" audit with high scores. ---
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at, created_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${REAL_OLDER_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 103, 'complete', ${ENGINES}, 15, 1, NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days',
      85.7, 80, 90, 90, 85, 83)
  `;
  await seedCitations({
    auditId: REAL_OLDER_AUDIT_ID,
    sampleCount: 30,
    mentionedCount: 24,
    accWithSourcesCount: 20,
  });

  // --- Scenario B: a later, real "weighted" audit with a genuine,
  // large drop in every dimension. ---
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at, created_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${REAL_CURRENT_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 104, 'complete', ${ENGINES}, 15, 1, NOW(), NOW(),
      18.9, 60, 5, 5, 5, 6)
  `;
  await seedCitations({
    auditId: REAL_CURRENT_AUDIT_ID,
    sampleCount: 30,
    mentionedCount: 18,
    accWithSourcesCount: 1,
  });
});

afterAll(async () => {
  const auditIds = [
    ZERO_AUDIT_ID,
    REAL_PREVIOUS_AUDIT_ID,
    REAL_OLDER_AUDIT_ID,
    REAL_CURRENT_AUDIT_ID,
  ];
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function loadAudit(id: string) {
  const { audits } = await import("@/db/schema");
  const { serviceDb } = await import("@/db/client");
  const { eq } = await import("drizzle-orm");
  const [row] = await serviceDb.select().from(audits).where(eq(audits.id, id));
  if (!row) throw new Error(`audit ${id} not found in test DB`);
  return row;
}

describe("buildDriftInput + detectDrift — insufficient-data gating (real DB)", () => {
  it("a zero-mention audit's composite never raises significant_drop against a real prior ~45 composite", async () => {
    const { buildDriftInput } = await import("@/inngest/functions/detect-drift");
    const { detectDrift } = await import("@/lib/drift/detect");
    const { withRlsContext } = await import("@/db/client");

    const current = await loadAudit(ZERO_AUDIT_ID);
    const previous = await loadAudit(REAL_PREVIOUS_AUDIT_ID);

    const driftInput = await withRlsContext(ORG_ID, (tx) => buildDriftInput(tx, current, previous));
    expect(driftInput.currentCompositeBasis).toBe("frequency_only");
    expect(driftInput.previousCompositeBasis).toBe("weighted");
    expect(driftInput.currentComposite).toBe(0);

    const result = detectDrift(driftInput);
    expect(result.compositeSeverity).not.toBe("significant_drop");
    expect(result.compositeSeverity).toBe("within_noise");
    expect(result.compositeBasisMismatch).toBe(true);
  });

  it("basis mismatch holds in the reverse direction too (zero-mention as the PREVIOUS audit)", async () => {
    const { buildDriftInput } = await import("@/inngest/functions/detect-drift");
    const { detectDrift } = await import("@/lib/drift/detect");
    const { withRlsContext } = await import("@/db/client");

    const current = await loadAudit(REAL_PREVIOUS_AUDIT_ID);
    const previous = await loadAudit(ZERO_AUDIT_ID);

    const driftInput = await withRlsContext(ORG_ID, (tx) => buildDriftInput(tx, current, previous));
    const result = detectDrift(driftInput);
    expect(result.compositeSeverity).not.toBe("significant_rise");
    expect(result.compositeSeverity).toBe("within_noise");
    expect(result.compositeBasisMismatch).toBe(true);
  });

  it("two real weighted-basis audits with a genuine composite drop and non-overlapping CIs still correctly raise significant_drop (no regression)", async () => {
    const { buildDriftInput } = await import("@/inngest/functions/detect-drift");
    const { detectDrift } = await import("@/lib/drift/detect");
    const { withRlsContext } = await import("@/db/client");

    const current = await loadAudit(REAL_CURRENT_AUDIT_ID);
    const previous = await loadAudit(REAL_OLDER_AUDIT_ID);

    const driftInput = await withRlsContext(ORG_ID, (tx) => buildDriftInput(tx, current, previous));
    expect(driftInput.currentCompositeBasis).toBe("weighted");
    expect(driftInput.previousCompositeBasis).toBe("weighted");

    const result = detectDrift(driftInput);
    expect(result.compositeBasisMismatch).toBe(false);
    expect(result.compositeSeverity).toBe("significant_drop");
    expect(result.hasSignificant).toBe(true);
  });

  // Task #46 Phase 3, Part C: RED under the pre-fix code (Sentiment 90->5,
  // Context 85->5 are both genuine, large stored-column drops that would
  // have raised their own significant_drop dimensionDeltas), GREEN here --
  // both are unconditionally not_measured now, excluded from
  // currentScores/previousScores, so buildDriftInput/detectDrift's
  // existing `?? 50` / `?? WIDE_CI` fallback (the same mechanism that
  // already neutralised insufficient_data) makes them compare 50 vs 50
  // with an identical wide CI -- always within_noise, never a fabricated
  // "Sentiment/Context dropped" alert, even while Frequency/Position/
  // Source-citation correctly still raise real drift from the same pair
  // of audits.
  it("Sentiment/Context never raise drift even with a genuine large stored-column drop (not_measured, excluded from the comparison)", async () => {
    const { buildDriftInput } = await import("@/inngest/functions/detect-drift");
    const { detectDrift } = await import("@/lib/drift/detect");
    const { withRlsContext } = await import("@/db/client");

    const current = await loadAudit(REAL_CURRENT_AUDIT_ID);
    const previous = await loadAudit(REAL_OLDER_AUDIT_ID);

    const driftInput = await withRlsContext(ORG_ID, (tx) => buildDriftInput(tx, current, previous));
    expect(driftInput.currentScores).not.toHaveProperty("sentiment");
    expect(driftInput.currentScores).not.toHaveProperty("context");
    expect(driftInput.previousScores).not.toHaveProperty("sentiment");
    expect(driftInput.previousScores).not.toHaveProperty("context");

    const result = detectDrift(driftInput);
    expect(result.dimensionDeltas.sentiment.severity).toBe("within_noise");
    expect(result.dimensionDeltas.context.severity).toBe("within_noise");
    // The real dimensions still correctly show the genuine drop.
    expect(result.dimensionDeltas.accuracy.severity).not.toBe("within_noise");
    expect(result.dimensionDeltas.position.severity).not.toBe("within_noise");
  });
});
