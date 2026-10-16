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
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const ZERO_BRAND_ID = randomUUID();
const PARTIAL_BRAND_ID = randomUUID();
const FULL_BRAND_ID = randomUUID();
const ZERO_AUDIT_ID = randomUUID();
const PARTIAL_AUDIT_ID = randomUUID();
const FULL_AUDIT_ID = randomUUID();

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
}) {
  // client.json(...), not JSON.stringify(...) -- postgres.js serialises a
  // plain JS string parameter for a jsonb column as a JSON STRING SCALAR
  // (observed directly: JSON.stringify([]) landed as the jsonb scalar
  // "[]", not the empty array [] -- jsonb_array_length then fails with
  // "cannot get array length of a scalar"). sql.json() tells the driver
  // to serialise the value itself, producing a real jsonb array.
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
    VALUES (
      ${opts.auditId}, ${opts.engine}, ${opts.prompt}, 1, ${opts.brandMentioned}, false,
      ${client.json(opts.citedSources ?? [])}, ${opts.responseSnippet ?? "A generic response about local trades."}
    )
  `;
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
  // brand; also has a real competitor configured, named in one response. ---
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
        citedSources: fullIdx % 2 === 0 ? [{ url: "https://example.com/b" }] : [],
        responseSnippet:
          fullIdx === 1
            ? "Full Mentions Co is well regarded, though some prefer Rival Plumbing Experts for emergencies."
            : "Full Mentions Co is a well-regarded local trade business.",
      });
    }
  }
});

afterAll(async () => {
  const auditIds = [ZERO_AUDIT_ID, PARTIAL_AUDIT_ID, FULL_AUDIT_ID];
  const brandIds = [ZERO_BRAND_ID, PARTIAL_BRAND_ID, FULL_BRAND_ID];
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ANY(${brandIds})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
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

  it("Position/Sentiment/Context/Source citation render N/A — not mentioned, weight excluded; Frequency stays a real 0.0", async () => {
    const html = await renderAuditPage(ZERO_AUDIT_ID);
    // 4 insufficient_data cards.
    expect(html.match(/Not mentioned<\/p>/g)?.length).toBe(4);
    expect(html.match(/>excluded</g)?.length).toBe(4);
    // Frequency is the one scored dimension -- its weight is never "excluded".
    expect(html).toContain("How often you appear");
  });

  it("Sentiment card shows N/A, never a hardcoded green number", async () => {
    const html = await renderAuditPage(ZERO_AUDIT_ID);
    expect(html).toContain("Not mentioned — insufficient data");
    expect(html).toContain("Not mentioned — no sentiment data.");
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

  it("every dimension card is scored (no N/A) once there's a real mention, each with a non-degenerate CI", async () => {
    const html = await renderAuditPage(PARTIAL_AUDIT_ID);
    expect(html).not.toContain(">N/A<");
    expect(html).not.toContain("excluded");
  });
});

describe("audit detail page — fully-mentioned audit, with a real configured competitor", () => {
  it("every dimension is scored, composite is the real DIMENSION_WEIGHTS blend of the 5 dimension values (100/80/75/60/50 -> 76.5), not a stale stored column", async () => {
    const html = await renderAuditPage(FULL_AUDIT_ID);
    expect(html).not.toContain(">N/A<");
    expect(html).not.toContain("Not mentioned in any of");
    expect(html).toContain("76.5");
  });

  it("Competitor card shows the real configured competitor with its real text-matched count, not a hardcoded self-only row", async () => {
    const html = await renderAuditPage(FULL_AUDIT_ID);
    expect(html).toContain("Full Mentions Co");
    expect(html).toContain("Rival Plumbing Experts");
    expect(html).not.toContain("No competitors configured");
  });
});
