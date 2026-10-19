/**
 * Task #46 Phase 2, Part 2 -- real-DB proof that the PDF export route
 * (app/api/audits/[auditId]/export/route.ts) resolves the SAME
 * insufficient-data contract (lib/scoring/dimension-result.ts) the audit
 * page does, from real citations rows, not from trusting the stored
 * audits.score* columns as plain numbers. Mirrors the seeding pattern of
 * tests/integration/audit-page-insufficient-data.integration.test.ts
 * (Phase 1's own reference test, read-only reference) -- real org/brand/
 * audit/citations rows in the local test DB (⚠️ DEV/TEST DB ONLY -- never
 * run against visibleau_prod), via getTestDatabaseUrl() + a raw
 * postgres() client.
 *
 * `renderAuditPdf` (lib/pdf/render.tsx) is mocked here, deliberately: this
 * test's job is to prove the ROUTE's own DB query + resolveDimension/
 * resolveComposite wiring produces the correct AuditPdfData for a
 * zero-mention audit (the exact bug class Phase 1 found: a Postgres
 * SUM()-derived count surfacing as a string, silently defeating the
 * `=== 0` gate) -- not to re-verify react-pdf's own text-layout engine,
 * which lib/pdf/render.tsx has no test coverage for at all and isn't this
 * task's concern. Capturing the exact AuditPdfData object passed to the
 * renderer is a strictly stronger assertion than grepping rendered PDF
 * bytes would be.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { mockRenderAuditPdf } = vi.hoisted(() => ({ mockRenderAuditPdf: vi.fn() }));
vi.mock("@/lib/pdf/render", () => ({
  renderAuditPdf: mockRenderAuditPdf,
}));

const ORG_ID = randomUUID();
const ZERO_BRAND_ID = randomUUID();
const PARTIAL_BRAND_ID = randomUUID();
const ZERO_AUDIT_ID = randomUUID();
const PARTIAL_AUDIT_ID = randomUUID();

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
  runNumber?: number;
}) {
  // client.json(...), not JSON.stringify(...) -- see the Phase 1 reference
  // integration test's own comment: postgres.js serialises a plain JS
  // string parameter for a jsonb column as a JSON STRING SCALAR, not a
  // real jsonb array, which then fails jsonb_array_length downstream.
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
    VALUES (
      ${opts.auditId}, ${opts.engine}, ${opts.prompt}, ${opts.runNumber ?? 1}, ${opts.brandMentioned}, false,
      ${client.json(opts.citedSources ?? [])}, 'A generic response about local trades.'
    )
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${ORG_ID}, ${`aeid-${ORG_ID}`}, 'AEID Test Org', ${`aeid-org-${ORG_ID}`})
  `;

  // --- Zero-mention brand/audit: no brand mentions at all. ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${ZERO_BRAND_ID}, ${ORG_ID}, 'Zero Mentions Export Co', 'zeroexport.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
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
        prompt: `export prompt ${p}`,
        brandMentioned: false,
      });
    }
  }

  // --- Partial-mention brand/audit: 3 of 12 organic responses mention the brand. ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${PARTIAL_BRAND_ID}, ${ORG_ID}, 'Partial Mentions Export Co', 'partialexport.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${PARTIAL_AUDIT_ID}, ${PARTIAL_BRAND_ID}, ${ORG_ID}, 2, 'complete', ${ENGINES}, 3, 1, now(),
      45, 30, 70, 75, 50, 33.33)
  `;
  let partialIdx = 0;
  for (const engine of ENGINES) {
    for (let p = 0; p < 3; p++) {
      partialIdx++;
      const mentioned = partialIdx <= 3; // exactly 3 of 12 mention the brand
      await insertCitation({
        auditId: PARTIAL_AUDIT_ID,
        engine,
        prompt: `partial export prompt ${p}`,
        brandMentioned: mentioned,
        citedSources: mentioned && partialIdx === 1 ? [{ url: "https://example.com/a" }] : [],
      });
    }
  }
});

afterAll(async () => {
  const auditIds = [ZERO_AUDIT_ID, PARTIAL_AUDIT_ID];
  const brandIds = [ZERO_BRAND_ID, PARTIAL_BRAND_ID];
  // trackExport() (called by the route on every successful export) writes
  // an audit_exports row keyed to the audit -- delete it first or the FK
  // constraint blocks deleting the audit itself.
  await client`DELETE FROM audit_exports WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ANY(${brandIds})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

beforeEach(() => {
  mockRenderAuditPdf.mockReset();
  mockRenderAuditPdf.mockResolvedValue(Buffer.from("%PDF-1.4 stub"));
});

async function callPdfExport(auditId: string) {
  const { GET } = await import("@/app/api/audits/[auditId]/export/route");
  const req = new Request(`http://localhost/api/audits/${auditId}/export?format=pdf`);
  const res = await GET(req, { params: Promise.resolve({ auditId }) });
  return res;
}

describe("PDF export route — zero-mention audit", () => {
  // Task #46 Phase 3, Part C: Sentiment/Context are a THIRD state here,
  // distinct from Position/Source-citation's insufficient_data -- they're
  // unconditionally not_measured (no real classifier exists at all),
  // never gated on mention count the way insufficient_data is. See
  // resolveAuditDimensions in app/api/audits/[auditId]/export/route.ts.
  it("resolves Position/Source-citation as insufficient_data and Sentiment/Context as not_measured, never a fabricated 0, while Frequency stays a real scored 0", async () => {
    const res = await callPdfExport(ZERO_AUDIT_ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");

    expect(mockRenderAuditPdf).toHaveBeenCalledTimes(1);
    const data = mockRenderAuditPdf.mock.calls[0][0];

    expect(data.dimensions.frequency).toEqual({
      status: "scored",
      value: 0,
      ci: { lower: 0, upper: expect.any(Number) },
    });
    expect(data.dimensions.frequency.ci.upper).toBeGreaterThan(0);

    for (const dim of ["position", "accuracy"] as const) {
      expect(data.dimensions[dim]).toEqual({ status: "insufficient_data", reason: "no_mentions" });
    }
    for (const dim of ["sentiment", "context"] as const) {
      expect(data.dimensions[dim]).toEqual({ status: "not_measured", reason: "no_classifier" });
    }
  });

  // Vunnara (19 Oct, post-aa83b3a), "the headline is the mention rate":
  // AuditPdfData.composite (CompositeResult) is gone -- .headline is the
  // Frequency DimensionResult directly, still a real "scored" 0% (not
  // insufficient_data -- there WERE 8 real answers) with a non-
  // degenerate CI (not a collapsed 0-0).
  it("headline is scored at 0 with a non-degenerate CI (not a collapsed 0–0)", async () => {
    await callPdfExport(ZERO_AUDIT_ID);
    const data = mockRenderAuditPdf.mock.calls[0][0];

    expect(data.headline.status).toBe("scored");
    expect(data.headline.value).toBe(0);
    expect(data.headline.ci.lower).toBe(0);
    expect(data.headline.ci.upper).toBeGreaterThan(0);
  });
});

describe("PDF export route — partial-mention audit (3 of 12 organic responses)", () => {
  // Task #46 Phase 3, Part C: Sentiment/Context stay not_measured even
  // with real mentions present -- that state is unconditional, not gated
  // on mention count the way insufficient_data is.
  it("resolves Frequency/Position/Source-citation as scored once there's a real mention; Sentiment/Context stay not_measured; headline equals Frequency", async () => {
    const res = await callPdfExport(PARTIAL_AUDIT_ID);
    expect(res.status).toBe(200);

    const data = mockRenderAuditPdf.mock.calls[0][0];
    for (const dim of ["frequency", "position", "accuracy"] as const) {
      expect(data.dimensions[dim].status).toBe("scored");
    }
    for (const dim of ["sentiment", "context"] as const) {
      expect(data.dimensions[dim].status).toBe("not_measured");
    }
    expect(data.headline).toEqual(data.dimensions.frequency);
  });
});
