/**
 * Task #46 Phase 2, Part 1 (+ Vunnara 19 Oct, post-aa83b3a, "the
 * headline is the mention rate") -- real-DB proof that drift
 * detection's headline comparison (lib/drift/detect.ts + the honest
 * read-time recomputation in inngest/functions/detect-drift.ts's
 * buildDriftInput) never fabricates drift from missing data, while
 * still correctly raising drift for a genuine, comparable change.
 *
 * The composite basis concept ("frequency_only" vs "weighted") this
 * file originally tested is gone -- the headline is now ALWAYS
 * Frequency alone, so there's only ever one basis
 * (currentCompositeBasis/previousCompositeBasis are now permanently
 * "frequency_only" literals). What used to be gated on a basis
 * mismatch is now gated purely by Wilson CI overlap on the headline
 * itself (Scenario A/C below), and a genuinely data-less audit (zero
 * successful organic answers, not just zero mentions) falls back to a
 * WIDE_CI so it can never look like a real drop (the new Scenario D).
 * Scenario B's real point also shifts: a dramatic Position collapse no
 * longer moves the HEADLINE at all (the mention rate barely changed),
 * but still correctly raises a per-dimension Position drift -- proving
 * the headline and the per-dimension grid are doing genuinely
 * different jobs now.
 *
 * The unit tests in tests/unit/drift/detect.test.ts prove the pure
 * gating logic in isolation; this proves buildDriftInput actually
 * wires real seeded `citations` rows through resolveDimension/
 * resolveHeadline into the shape detectDrift needs.
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

// Scenario C: the exact live bug (Bondi Audit #8) -- a STALE stored
// score_frequency/score_composite (44.4) that no longer matches the real
// organic citations (0 of 20 mentioned, post a retroactive is_branded_prompt
// correction). Proves drift compares the RECOMPUTED value (0), never the
// stale stored one, against the real previous audit.
const STALE_STORED_AUDIT_ID = randomUUID();

// Scenario D: a genuinely data-less audit -- zero successful organic
// answers at all (not just zero mentions), e.g. every engine call
// failed. The headline is insufficient_data ("no_answers"), not a real
// 0% -- proves this never fabricates a drift signal against a real
// prior audit either.
const ZERO_ANSWERS_AUDIT_ID = randomUUID();

const ENGINES = ["chatgpt", "claude"];

let client: ReturnType<typeof postgres>;

async function seedCitations(opts: {
  auditId: string;
  sampleCount: number;
  mentionedCount: number;
  accWithSourcesCount: number;
  /** Task #46 (fix: stored value contradicting its own CI) -- Position is
   * now recomputed from real citations.position values (median), not
   * trusted from the stored score_position column, so every mentioned
   * row needs a real position for a drift scenario to exercise a
   * genuine Position change. Applied to every mentioned row.
   * Vunnara (21 Oct, hotfix: "Usually #16") -- the stored `position`
   * column below is now display/scoring-inert (lib/scoring/resolve-
   * audit-dimensions.ts recomputes the real rank from response text
   * instead); a real Position change now needs a response_snippet with
   * an actual numbered line matching mentionedPosition, not just the
   * column. */
  mentionedPosition?: number;
}) {
  for (let i = 0; i < opts.sampleCount; i++) {
    const mentioned = i < opts.mentionedCount;
    const hasSource = mentioned && i < opts.accWithSourcesCount;
    const snippet =
      mentioned && opts.mentionedPosition != null
        ? `${opts.mentionedPosition}. Drift Test Co is a well-regarded local business.`
        : "A generic response about local trades.";
    await client`
      INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet, position)
      VALUES (
        ${opts.auditId}, ${ENGINES[i % ENGINES.length]}, ${`prompt ${i}`}, 1, ${mentioned}, false,
        ${client.json(hasSource ? [{ url: "https://example.com/src" }] : [])},
        ${snippet},
        ${mentioned ? opts.mentionedPosition ?? null : null}
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
    // median position 6 -> positionDimensionScore = (1-(6-1)/50)*100 = 90,
    // matching the stored score_position (90) this fixture used to
    // (correctly) assume without any real position data behind it.
    mentionedPosition: 6,
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
    // median position 49 -> positionDimensionScore = (1-(49-1)/50)*100 = 4,
    // a genuine, large drop from the older audit's 90 -- not the stale
    // stored score_position (5), but close to it and still clearly a
    // real, large decline.
    mentionedPosition: 49,
  });

  // --- Scenario C: Bondi Audit #8's exact shape -- stored 44.4 (stale,
  // computed before a retroactive is_branded_prompt correction), real
  // citations show 0 of 20 organic mentions. ---
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at, created_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${STALE_STORED_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 105, 'complete', ${ENGINES}, 10, 1, NOW(), NOW(),
      44.4, 44.4, 44.4, 44.4, 44.4, 44.4)
  `;
  await seedCitations({
    auditId: STALE_STORED_AUDIT_ID,
    sampleCount: 20,
    mentionedCount: 0,
    accWithSourcesCount: 0,
  });

  // --- Scenario D: zero successful organic answers at all -- no
  // citations rows seeded for this audit, on purpose. ---
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at, created_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${ZERO_ANSWERS_AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 106, 'complete', ${ENGINES}, 10, 1, NOW(), NOW(),
      0, 0, 0, 0, 0, 0)
  `;
});

afterAll(async () => {
  const auditIds = [
    ZERO_AUDIT_ID,
    REAL_PREVIOUS_AUDIT_ID,
    REAL_OLDER_AUDIT_ID,
    REAL_CURRENT_AUDIT_ID,
    STALE_STORED_AUDIT_ID,
    ZERO_ANSWERS_AUDIT_ID,
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
  it("a 0-of-12 current audit's headline never raises significant_drop against a real 3-of-12 previous audit (real, overlapping Wilson CIs)", async () => {
    const { buildDriftInput } = await import("@/inngest/functions/detect-drift");
    const { detectDrift } = await import("@/lib/drift/detect");
    const { withRlsContext } = await import("@/db/client");

    const current = await loadAudit(ZERO_AUDIT_ID);
    const previous = await loadAudit(REAL_PREVIOUS_AUDIT_ID);

    const driftInput = await withRlsContext(ORG_ID, (tx) => buildDriftInput(tx, current, previous));
    // There's only ever one basis now -- the headline is always
    // Frequency alone, never a blend.
    expect(driftInput.currentCompositeBasis).toBe("frequency_only");
    expect(driftInput.previousCompositeBasis).toBe("frequency_only");
    expect(driftInput.currentComposite).toBe(0);

    const result = detectDrift(driftInput);
    expect(result.compositeSeverity).not.toBe("significant_drop");
    expect(result.compositeSeverity).toBe("within_noise");
    expect(result.compositeBasisMismatch).toBe(false);
  });

  it("the same holds in the reverse direction (0-of-12 as the PREVIOUS audit)", async () => {
    const { buildDriftInput } = await import("@/inngest/functions/detect-drift");
    const { detectDrift } = await import("@/lib/drift/detect");
    const { withRlsContext } = await import("@/db/client");

    const current = await loadAudit(REAL_PREVIOUS_AUDIT_ID);
    const previous = await loadAudit(ZERO_AUDIT_ID);

    const driftInput = await withRlsContext(ORG_ID, (tx) => buildDriftInput(tx, current, previous));
    const result = detectDrift(driftInput);
    expect(result.compositeSeverity).not.toBe("significant_rise");
    expect(result.compositeSeverity).toBe("within_noise");
    expect(result.compositeBasisMismatch).toBe(false);
  });

  it("a real Position collapse never moves the headline, but still correctly raises its own per-dimension drift (no regression)", async () => {
    const { buildDriftInput } = await import("@/inngest/functions/detect-drift");
    const { detectDrift } = await import("@/lib/drift/detect");
    const { withRlsContext } = await import("@/db/client");

    const current = await loadAudit(REAL_CURRENT_AUDIT_ID);
    const previous = await loadAudit(REAL_OLDER_AUDIT_ID);

    const driftInput = await withRlsContext(ORG_ID, (tx) => buildDriftInput(tx, current, previous));
    expect(driftInput.currentCompositeBasis).toBe("frequency_only");
    expect(driftInput.previousCompositeBasis).toBe("frequency_only");

    const result = detectDrift(driftInput);
    expect(result.compositeBasisMismatch).toBe(false);
    // Vunnara (19 Oct, post-aa83b3a): the headline is 18/30 (60%) vs
    // 24/30 (80%) -- real Wilson CIs at n=30 overlap, so the headline
    // itself correctly stays quiet (within_noise). Position collapsed
    // from a median rank of ~6 to ~49 -- a real, large decline the
    // per-dimension grid still correctly flags, proving the headline
    // and the per-dimension breakdown are doing genuinely different
    // jobs now (the headline no longer moves just because Position did).
    expect(result.compositeSeverity).toBe("within_noise");
    expect(result.dimensionDeltas.position.severity).toBe("significant_drop");
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

  // Task #46 (fix: stored value contradicting its own CI) -- the exact
  // live bug, reproduced for drift specifically: a STALE stored 44.4
  // (Bondi Audit #8's real shape) must never be read as "the current
  // score is 44.4" when comparing against a real previous audit -- drift
  // must see the RECOMPUTED 0 (0 of 20 real organic mentions), the same
  // value the audit page itself now displays.
  it("a stale stored headline (44.4) never leaks into the drift comparison -- the recomputed value (0) is what's actually compared", async () => {
    const { buildDriftInput } = await import("@/inngest/functions/detect-drift");
    const { withRlsContext } = await import("@/db/client");

    const current = await loadAudit(STALE_STORED_AUDIT_ID);
    const previous = await loadAudit(REAL_PREVIOUS_AUDIT_ID);

    const driftInput = await withRlsContext(ORG_ID, (tx) => buildDriftInput(tx, current, previous));
    // 0 real organic mentions, matching the real citations -- never the
    // stale stored 44.4.
    expect(driftInput.currentComposite).toBe(0);
    expect(driftInput.currentComposite).not.toBe(44.4);

    const { detectDrift } = await import("@/lib/drift/detect");
    const result = detectDrift(driftInput);
    // Real Wilson CIs at these sample sizes (0/20 vs 3/12) overlap, so
    // this is within_noise on its own merits -- the stale 44.4 could
    // never have produced this verdict on its own (0 vs 44.4 is itself a
    // real-looking gap) -- within_noise here specifically proves the
    // recomputed 0 (not 44.4) is what fed the comparison.
    expect(result.compositeSeverity).toBe("within_noise");
  });

  it("a genuinely data-less audit (0 successful organic answers) never fabricates drift against a real prior audit", async () => {
    const { buildDriftInput } = await import("@/inngest/functions/detect-drift");
    const { detectDrift } = await import("@/lib/drift/detect");
    const { withRlsContext } = await import("@/db/client");

    const current = await loadAudit(ZERO_ANSWERS_AUDIT_ID);
    const previous = await loadAudit(REAL_PREVIOUS_AUDIT_ID);

    const driftInput = await withRlsContext(ORG_ID, (tx) => buildDriftInput(tx, current, previous));
    // No successful answers at all -- the headline's own WIDE_CI
    // fallback (not a real, narrow Wilson interval) is what prevents a
    // fabricated drop here, same mechanism as the per-dimension gate.
    expect(driftInput.currentComposite).toBe(0);
    expect(driftInput.currentCompositeCI).toEqual({ lower: 0, upper: 100 });

    const result = detectDrift(driftInput);
    expect(result.compositeSeverity).toBe("within_noise");
    expect(result.compositeBasisMismatch).toBe(false);
  });
});
