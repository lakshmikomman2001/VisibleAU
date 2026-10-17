/**
 * Task #46 Phase 1, Part 4 -- real-DB render proof for the audit detail
 * page's "insufficient data" handling across the three shapes a real
 * audit can take: zero mentions, partial mentions, full mentions. The
 * unit tests in tests/unit/scoring/dimension-result.test.ts prove the
 * pure resolveDimension/resolveComposite logic; this proves the PAGE
 * actually wires real DB rows (citations' run_number=1/organic/
 * brand_mentioned columns) through that logic and renders the right
 * text -- not a mock, not a stub, real seeded rows in the local test DB
 * (⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod).
 */
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const ZERO_BRAND_ID = randomUUID();
const PARTIAL_BRAND_ID = randomUUID();
const FULL_BRAND_ID = randomUUID();
const CACHE_BRAND_ID = randomUUID();
const ZERO_AUDIT_ID = randomUUID();
const PARTIAL_AUDIT_ID = randomUUID();
const FULL_AUDIT_ID = randomUUID();
const CACHE_AUDIT_ID = randomUUID();
const CACHE_PROMPT = "best plumber near me";
const CACHE_MODEL = "gpt-test-model";

const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"];

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

let client: ReturnType<typeof postgres>;

async function insertCitation(opts: {
  auditId: string;
  engine: string;
  prompt: string;
  brandMentioned: boolean;
  citedSources?: Array<{ url: string }>;
  responseSnippet?: string;
  runNumber?: number;
  llmModel?: string;
  position?: number | null;
}) {
  // client.json(...), not JSON.stringify(...) -- postgres.js serialises a
  // plain JS string parameter for a jsonb column as a JSON STRING SCALAR
  // (observed directly: JSON.stringify([]) landed as the jsonb scalar
  // "[]", not the empty array [] -- jsonb_array_length then fails with
  // "cannot get array length of a scalar"). sql.json() tells the driver
  // to serialise the value itself, producing a real jsonb array.
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet, llm_model, position)
    VALUES (
      ${opts.auditId}, ${opts.engine}, ${opts.prompt}, ${opts.runNumber ?? 1}, ${opts.brandMentioned}, false,
      ${client.json(opts.citedSources ?? [])}, ${opts.responseSnippet ?? "A generic response about local trades."},
      ${opts.llmModel ?? null}, ${opts.position ?? null}
    )
  `;
}

function llmCacheKey(prompt: string, model: string): string {
  return createHash("sha256").update(`${prompt}\n${model}`).digest("hex");
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${ORG_ID}, ${`aid-${ORG_ID}`}, 'AID Test Org', ${`aid-org-${ORG_ID}`})
  `;

  // --- Zero-mention brand/audit: no competitors configured ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${ZERO_BRAND_ID}, ${ORG_ID}, 'Zero Mentions Co', 'zeromentions.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${ZERO_AUDIT_ID}, ${ZERO_BRAND_ID}, ${ORG_ID}, 1, 'complete', ${ENGINES}, 2, 1, now(),
      0, 0, 0, 0, 0, 0)
  `;
  for (const engine of ENGINES) {
    for (let p = 0; p < 2; p++) {
      await insertCitation({
        auditId: ZERO_AUDIT_ID,
        engine,
        prompt: `prompt ${p}`,
        brandMentioned: false,
      });
    }
  }

  // --- Partial-mention brand/audit: 3 of 10 organic responses mention the brand ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${PARTIAL_BRAND_ID}, ${ORG_ID}, 'Partial Mentions Co', 'partialmentions.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${PARTIAL_AUDIT_ID}, ${PARTIAL_BRAND_ID}, ${ORG_ID}, 2, 'complete', ${ENGINES}, 3, 1, now(),
      45, 30, 70, 75, 50, 33.33)
  `;
  let partialPromptIdx = 0;
  for (const engine of ENGINES) {
    for (let p = 0; p < 3; p++) {
      partialPromptIdx++;
      const mentioned = partialPromptIdx <= 3; // exactly 3 of 12 mention the brand
      await insertCitation({
        auditId: PARTIAL_AUDIT_ID,
        engine,
        prompt: `partial prompt ${p}`,
        brandMentioned: mentioned,
        citedSources: mentioned && partialPromptIdx === 1 ? [{ url: "https://example.com/a" }] : [],
      });
    }
  }

  // --- Full-mention brand/audit: every organic response mentions the
  // brand; also has a real competitor configured, named in one response.
  // Stored score_* columns are deliberately STALE/WRONG here (76.5/80) --
  // Task #46's stored-value-contradicts-its-own-CI fix means the page
  // must recompute every value from these real citations rows (position
  // = 1 for every mention, 4 of 8 with a cited source), never trust the
  // stored columns, so the stale numbers below must NEVER appear
  // unchanged in the rendered page. ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${FULL_BRAND_ID}, ${ORG_ID}, 'Full Mentions Co', 'fullmentions.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY['Rival Plumbing Experts'])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${FULL_AUDIT_ID}, ${FULL_BRAND_ID}, ${ORG_ID}, 3, 'complete', ${ENGINES}, 2, 1, now(),
      76.5, 100, 80, 75, 60, 50)
  `;
  let fullIdx = 0;
  for (const engine of ENGINES) {
    for (let p = 0; p < 2; p++) {
      fullIdx++;
      await insertCitation({
        auditId: FULL_AUDIT_ID,
        engine,
        prompt: `full prompt ${p}`,
        brandMentioned: true,
        // Every real mention ranks the brand first -- median position 1,
        // positionDimensionScore(1) = 100, not the stale stored 80.
        position: 1,
        citedSources: fullIdx % 2 === 0 ? [{ url: "https://example.com/b" }] : [],
        responseSnippet:
          fullIdx === 1
            ? "Full Mentions Co is well regarded, though some prefer Rival Plumbing Experts for emergencies."
            : "Full Mentions Co is a well-regarded local trade business.",
      });
    }
  }
  // --- Cache-aware competitor-text brand/audit: proves (a) the
  // competitor scan prefers the LLM response cache's FULL text over the
  // truncated response_snippet when the cache is still warm, and (b) it
  // scans only run_number = 1, never a replay. ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${CACHE_BRAND_ID}, ${ORG_ID}, 'Cache Text Co', 'cachetext.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY['Beyond The Fold Plumbing', 'Never Counted Plumbing'])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${CACHE_AUDIT_ID}, ${CACHE_BRAND_ID}, ${ORG_ID}, 4, 'complete', ${ENGINES}, 1, 2, now(),
      100, 100, 90, 80, 70, 60)
  `;
  // The competitor's name only appears after character 500 -- invisible
  // to a scan of the truncated response_snippet alone.
  const fullResponseText =
    "Cache Text Co is a well-regarded local plumbing business. ".repeat(10) +
    "Some customers also recommend Beyond The Fold Plumbing for larger jobs.";
  await client`
    INSERT INTO llm_response_cache (cache_key, prompt, model, response, tokens_used, cost_estimate_usd, expires_at)
    VALUES (${llmCacheKey(CACHE_PROMPT, CACHE_MODEL)}, ${CACHE_PROMPT}, ${CACHE_MODEL}, ${fullResponseText}, 100, 0, now() + interval '48 hours')
  `;
  // run_number = 1: the real call -- text recoverable via the cache.
  await insertCitation({
    auditId: CACHE_AUDIT_ID,
    engine: "chatgpt",
    prompt: CACHE_PROMPT,
    llmModel: CACHE_MODEL,
    brandMentioned: true,
    runNumber: 1,
    responseSnippet: fullResponseText.slice(0, 500),
  });
  // run_number = 2: a cache replay of the SAME prompt -- its snippet
  // names a SECOND, different "competitor" that must NOT be counted;
  // if the scan wrongly included replays, this would leak through.
  await insertCitation({
    auditId: CACHE_AUDIT_ID,
    engine: "chatgpt",
    prompt: CACHE_PROMPT,
    llmModel: CACHE_MODEL,
    brandMentioned: true,
    runNumber: 2,
    responseSnippet: "Cache Text Co is fine, though some prefer Never Counted Plumbing instead.",
  });
});

afterAll(async () => {
  const auditIds = [ZERO_AUDIT_ID, PARTIAL_AUDIT_ID, FULL_AUDIT_ID, CACHE_AUDIT_ID];
  const brandIds = [ZERO_BRAND_ID, PARTIAL_BRAND_ID, FULL_BRAND_ID, CACHE_BRAND_ID];
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ANY(${brandIds})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client`DELETE FROM llm_response_cache WHERE cache_key = ${llmCacheKey(CACHE_PROMPT, CACHE_MODEL)}`.catch(
    () => {},
  );
  await client.end();
});

async function renderAuditPage(auditId: string): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  const element = await AuditPage({
    params: Promise.resolve({ auditId }),
    searchParams: Promise.resolve({}),
  });
  return renderToStaticMarkup(element);
}

describe("audit detail page — zero-mention audit", () => {
  it("composite is 0.0 with a non-degenerate CI and the frequency_only subline, not a 0.0–0.0 point", async () => {
    const html = await renderAuditPage(ZERO_AUDIT_ID);
    expect(html).toContain("Not mentioned in any of 8 answers across 4 engines");
    // 95% CI: 0.0 — X.X where X.X > 0 -- grep the CI line's own two numbers
    // rather than a brittle exact string match on the non-zero upper bound.
    const ciMatch = html.match(/95% CI: (\d+\.\d) — (\d+\.\d)/);
    expect(ciMatch).not.toBeNull();
    expect(Number(ciMatch?.[1])).toBe(0);
    expect(Number(ciMatch?.[2])).toBeGreaterThan(0);
  });

  // Task #46 Phase 3, Part C: Sentiment/Context are a THIRD, distinct
  // state from Position/Source citation here. At 0 mentions, Position and
  // Source citation are "insufficient_data" (no mention rows to measure
  // from -- "Not mentioned" / weight "excluded"); Sentiment and Context are
  // unconditionally "not_measured" (no real classifier exists at all,
  // regardless of mentions -- "Not yet measured" / weight "not measured").
  it("Position/Source citation render N/A — insufficient data; Sentiment/Context render 'Not yet measured'; Frequency stays a real 0.0", async () => {
    const html = await renderAuditPage(ZERO_AUDIT_ID);
    expect(html.match(/Not mentioned<\/p>/g)?.length).toBe(2);
    expect(html.match(/>excluded</g)?.length).toBe(2);
    expect(html.match(/Not yet measured<\/p>/g)?.length).toBe(2);
    expect(html.match(/>not measured</g)?.length).toBe(2);
    // Frequency is the one scored dimension -- its weight is never
    // "excluded" or "not measured".
    expect(html).toContain("How often you appear");
  });

  it("Sentiment card shows 'Not yet measured', never a hardcoded green number or a fabricated breakdown", async () => {
    const html = await renderAuditPage(ZERO_AUDIT_ID);
    expect(html).toContain('aria-label="Not yet measured"');
    expect(html).toContain("Not yet measured — tone and recommendation analysis");
    // The old Positive/Neutral/Negative breakdown (derived from the same
    // mention-presence fabrication) is gone, not just relabelled.
    expect(html).not.toContain("Positive");
    expect(html).not.toContain("Negative");
  });

  it("Competitor card shows the honest empty state, not a one-row '#1 you' list (no competitors configured)", async () => {
    const html = await renderAuditPage(ZERO_AUDIT_ID);
    expect(html).toContain("No competitors configured yet.");
    expect(html).toContain("Add competitors in brand settings to compare");
    // Not the hardcoded self-only row this card used to show unconditionally
    // (the audit number itself legitimately contains "#1", so assert on the
    // "(you)" ranking marker specifically, not the bare substring "#1").
    expect(html).not.toContain("(you)");
  });
});

describe("audit detail page — partial-mention audit (3 of 12 organic responses)", () => {
  it("composite basis is weighted (not frequency_only) the moment there's at least one mention", async () => {
    const html = await renderAuditPage(PARTIAL_AUDIT_ID);
    expect(html).not.toContain("Not mentioned in any of");
    // All 5 dimensions scored -> no "Based on X of 5 dimensions" subline either.
    expect(html).not.toContain("Based on");
  });

  // Task #46 Phase 3, Part C: Frequency/Position/Source citation are
  // scored the moment there's a real mention (no more N/A/insufficient),
  // but Sentiment/Context stay "not_measured" regardless -- they're
  // unconditional, never gated on mention count.
  it("Frequency/Position/Source citation are scored (no N/A) once there's a real mention; Sentiment/Context still render 'Not yet measured'", async () => {
    const html = await renderAuditPage(PARTIAL_AUDIT_ID);
    expect(html).not.toContain(">N/A<");
    expect(html.match(/Not mentioned<\/p>/g)).toBeNull();
    expect(html.match(/Not yet measured<\/p>/g)?.length).toBe(2);
    expect(html.match(/>not measured</g)?.length).toBe(2);
  });
});

describe("audit detail page — fully-mentioned audit, with a real configured competitor", () => {
  // Task #46 (fix: stored value contradicting its own CI): the composite
  // used to blend the STORED dimension values (100/80/75/60/50 -> 76.5 via
  // DIMENSION_WEIGHTS, or -> 80.8 once Phase 3 excluded Sentiment/Context
  // but still trusted the stored 80 for Position) -- it now recomputes
  // every value from the real citations rows (lib/scoring/resolve-audit-
  // dimensions.ts): Frequency 8/8 mentioned = 100, Position median 1 =
  // 100, Source citation 4/8 with a source = 50, renormalised 5/13, 5/13,
  // 3/13: 100*(5/13) + 100*(5/13) + 50*(3/13) ≈ 88.5. The stored
  // score_composite/score_position (76.5/80) must never appear.
  it("composite recomputes every value from real citations (100/100/50 -> 88.5), never the stale stored columns (76.5 composite, 80 position)", async () => {
    const html = await renderAuditPage(FULL_AUDIT_ID);
    expect(html).not.toContain(">N/A<");
    expect(html).not.toContain("Not mentioned in any of");
    expect(html).toContain("88.5");
    expect(html).not.toContain("76.5");
    expect(html).not.toContain("80.8");
  });

  it("Competitor card shows the real configured competitor with its real text-matched count, not a hardcoded self-only row", async () => {
    const html = await renderAuditPage(FULL_AUDIT_ID);
    expect(html).toContain("Full Mentions Co");
    expect(html).toContain("Rival Plumbing Experts");
    expect(html).not.toContain("No competitors configured");
  });

  // Task #46 (fix: stored value contradicting its own CI), Part D: with
  // runs_per_prompt = 1, there are no replays at all (real count ===
  // raw total) -- the label stays the plain, unqualified form instead of
  // an unnecessary "8 real · 8 incl. replays".
  it("the Responses tab label stays the plain form when there are no replays to disclose", async () => {
    const html = await renderAuditPage(FULL_AUDIT_ID);
    expect(html).toContain("Responses (8)");
    expect(html).not.toContain("incl. replays");
  });
});

describe("audit detail page — Competitor card reads the LLM response cache's full text, run_number = 1 only", () => {
  it("finds a competitor named only past character 500 of the full response, via the cache -- invisible to the truncated snippet alone", async () => {
    const html = await renderAuditPage(CACHE_AUDIT_ID);
    expect(html).toContain("Beyond The Fold Plumbing");
  });

  it("never counts a competitor name that only appears in a run_number > 1 replay row (shown, but with a real 0 count)", async () => {
    const html = await renderAuditPage(CACHE_AUDIT_ID);
    // It's still a configured competitor, so it's listed -- the proof is
    // its count is a real 0, not 1 (which it would be if the replay row
    // had wrongly been scanned too).
    const match = html.match(
      />Never Counted Plumbing<\/span><\/div><span[^>]*>(\d+)<\/span>/,
    );
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("0");
  });

  // Task #46 (fix: stored value contradicting its own CI), Part D: this
  // fixture has exactly 1 real citation (run_number 1) and 1 cache-replay
  // row (run_number 2) for the same (engine, prompt) -- the raw total is
  // 2, which must never be labelled as "Responses (2)" (reads as 2
  // independent answers). The tab label must show both numbers.
  it("the Responses tab label shows the real (run-1) count alongside the replay-inflated total, never just the raw total", async () => {
    const html = await renderAuditPage(CACHE_AUDIT_ID);
    expect(html).toContain("Responses (1 real · 2 incl. replays)");
    expect(html).not.toContain("Responses (2)");
  });
});
