/**
 * Task #46 (15th follow-up), Part B -- RED->GREEN for the two sample-audit
 * read endpoints (app/api/audits/[auditId]/status/route.ts,
 * app/(marketing)/sample-audit/result/[id]/page.tsx) the 14th follow-up's
 * serviceDb audit documented without fixing: neither had a DB-level
 * guarantee that a REAL customer audit could never be returned, relying
 * only on an app-level metadata.isSample boolean. Also covers the
 * already-safe sibling app/api/sample-audit/[auditId]/status/route.ts,
 * which gets the new rate limiter added in this same follow-up.
 *
 * No auth to mock here -- these routes are deliberately public. Seeds a
 * REAL non-sample org/audit and a REAL sample-org/sample audit, and calls
 * the route handlers / page function directly against the real test DB.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureSampleOrg } from "@/lib/sample-audit/synthetic-org";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

// The page (not a route handler) reads the caller's IP via next/headers'
// headers(), which throws outside a real request scope -- mocked here the
// same way other integration tests in this repo mock it (e.g.
// tests/integration/section2/section2.test.ts). The two API route tests
// below don't use this at all; they pass their IP via a real Request.
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const REAL_ORG_ID = randomUUID();
const REAL_BRAND_ID = randomUUID();
const REAL_AUDIT_ID = randomUUID();

// Vunnara (sample-audit follow-up, 20 Oct): resolved inside beforeAll
// via the SAME shared ensureSampleOrg() helper lib/sample-audit/run.ts
// itself uses, not a fresh org renamed to "__sample__" by hand -- that
// collided (unique constraint on slug) with the org other
// ensureSampleOrg()-based tests correctly leave behind permanently
// once ANY of them has already run against the same test DB.
let SAMPLE_ORG_ID: string;
const SAMPLE_BRAND_ID = randomUUID();
const SAMPLE_AUDIT_ID = randomUUID();

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  client = postgres(getTestDatabaseUrl(), { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, tier, region)
    VALUES (${REAL_ORG_ID}, ${`ra-org-${REAL_ORG_ID}`}, 'Real Customer Org', 'free', 'au')
  `;
  // The real sample-org slug the routes/page join on -- confirms that
  // join is load-bearing, same as before, just via the shared helper
  // instead of a locally-renamed fresh org.
  SAMPLE_ORG_ID = (await ensureSampleOrg()).id;

  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES
      (${REAL_BRAND_ID}, ${REAL_ORG_ID}, 'Real Secret Brand', ${`real-${randomUUID()}.example.com`}, 'tradies', 'au', ARRAY['NSW:Sydney']),
      (${SAMPLE_BRAND_ID}, ${SAMPLE_ORG_ID}, 'Sample Brand', ${`sample-${randomUUID()}.example.com`}, 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;

  // Real customer audit -- metadata deliberately has NO isSample flag at
  // all (the realistic case), status 'complete' so it would be fully
  // viewable if either check were bypassed.
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, score_composite)
    VALUES (${REAL_AUDIT_ID}, ${REAL_BRAND_ID}, ${REAL_ORG_ID}, 1, 'complete', 87.5)
  `;

  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, score_composite, metadata)
    VALUES (${SAMPLE_AUDIT_ID}, ${SAMPLE_BRAND_ID}, ${SAMPLE_ORG_ID}, 1, 'complete', 72.0, ${client.json({ isSample: true })})
  `;
});

afterAll(async () => {
  await client`DELETE FROM audits WHERE id IN (${REAL_AUDIT_ID}, ${SAMPLE_AUDIT_ID})`;
  await client`DELETE FROM brands WHERE id IN (${REAL_BRAND_ID}, ${SAMPLE_BRAND_ID})`;
  // Vunnara (sample-audit follow-up, 20 Oct): never delete SAMPLE_ORG_ID
  // itself -- it's the shared, permanent "__sample__" org every
  // ensureSampleOrg()-based test (and production) expects to keep
  // existing.
  await client`DELETE FROM organizations WHERE id = ${REAL_ORG_ID}`;
  await client.end();
});

function req(url: string) {
  return new Request(url, {
    headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` },
  });
}

describe("app/api/audits/[auditId]/status/route.ts", () => {
  it("a real (non-sample) audit ID -> 404, no status leaked", async () => {
    const { GET } = await import("@/app/api/audits/[auditId]/status/route");
    const res = await GET(req(`http://localhost/api/audits/${REAL_AUDIT_ID}/status`), {
      params: Promise.resolve({ auditId: REAL_AUDIT_ID }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBeUndefined();
  });

  it("the sample audit ID -> 200 with only {status}", async () => {
    const { GET } = await import("@/app/api/audits/[auditId]/status/route");
    const res = await GET(req(`http://localhost/api/audits/${SAMPLE_AUDIT_ID}/status`), {
      params: Promise.resolve({ auditId: SAMPLE_AUDIT_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "complete" });
  });
});

describe("app/api/sample-audit/[auditId]/status/route.ts", () => {
  it("a real (non-sample) audit ID -> 404", async () => {
    const { GET } = await import("@/app/api/sample-audit/[auditId]/status/route");
    const res = await GET(req(`http://localhost/api/sample-audit/${REAL_AUDIT_ID}/status`), {
      params: Promise.resolve({ auditId: REAL_AUDIT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("the sample audit ID -> 200 with status + real progress counts", async () => {
    const { GET } = await import("@/app/api/sample-audit/[auditId]/status/route");
    const res = await GET(req(`http://localhost/api/sample-audit/${SAMPLE_AUDIT_ID}/status`), {
      params: Promise.resolve({ auditId: SAMPLE_AUDIT_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Audit reliability, Part C, item 3: real progress -- answeredCount
    // (citations + engine_call_failures rows so far) and totalCalls
    // (the planned total) now ride alongside status, replacing the old
    // client-side-only fake progress bar. This fixture's audit has
    // neither citations nor a stored totalCalls, so both read as the
    // honest zero/null, not a fabricated number.
    expect(body).toEqual({ status: "complete", answeredCount: 0, totalCalls: null });
  });
});

describe("app/(marketing)/sample-audit/result/[id]/page.tsx", () => {
  it("a real (non-sample) audit ID -> notFound()", async () => {
    const SampleResultPage = (await import("@/app/(marketing)/sample-audit/result/[id]/page"))
      .default;
    await expect(
      SampleResultPage({ params: Promise.resolve({ id: REAL_AUDIT_ID }) }),
    ).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404") });
  });

  it("the sample audit ID -> only the allow-listed fields reach the client component", async () => {
    const SampleResultPage = (await import("@/app/(marketing)/sample-audit/result/[id]/page"))
      .default;
    const element = await SampleResultPage({ params: Promise.resolve({ id: SAMPLE_AUDIT_ID }) });
    const audit = (element as unknown as { props: { audit: Record<string, unknown> } }).props.audit;

    // Task #46 Phase 3, Part C: scoreComposite replaced by compositeValue
    // (the live resolveComposite recompute, excluding Sentiment/Context --
    // the stored column is stale); scoreSentimentNumeric/scoreContextNumeric
    // dropped entirely -- Sentiment/Context are unconditionally "Not yet
    // measured" now, so the view never needs their stored values at all.
    // Task #46 (fix: stored value contradicting its own CI): scoreFrequency/
    // scorePosition/scoreAccuracy (raw stored strings) replaced by
    // frequencyValue/positionValue/accuracyValue (plain numbers from the
    // same live resolveAuditDimensionsAndComposite recompute compositeValue
    // already used) -- the stored score_frequency/position/accuracy columns
    // never reach the client component at all now.
    // Vunnara (19 Oct): compositeValue -> headlineValue (the Frequency
    // DimensionResult -- mention rate, never a blend) plus noAnswers (the
    // headline's own insufficient_data "no_answers" state).
    // Vunnara (sample-audit follow-up, 20 Oct), item 6: + mentionedCount,
    // so the headline can show the same "Mentioned in k of n answers"
    // format real audits use, not a different phrase for this one
    // surface -- still just a count, nothing newly sensitive added to
    // the allow-list.
    // Audit reliability, Part C, item 4: + brandSuburb (the visitor-
    // confirmed location, for the "in <place>" headline) -- still just
    // a plain suburb string, nothing newly sensitive added.
    expect(Object.keys(audit).sort()).toEqual(
      [
        "accuracyValue",
        "brandDomain",
        "brandName",
        "brandSuburb",
        "headlineValue",
        "frequencyValue",
        "id",
        "insufficientData",
        "mentionedCount",
        "noAnswers",
        "positionValue",
        "sampleSize",
        "status",
      ].sort(),
    );
    expect(audit.metadata).toBeUndefined();
    expect(audit.brandName).toBe("Sample Brand");
    expect(audit.status).toBe("complete");
  });
});
