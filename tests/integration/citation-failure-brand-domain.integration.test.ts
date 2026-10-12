/**
 * Task #46 (6th follow-up): real-DB proof for checkBrandDomainNotCited()
 * (lib/visibility/citation-failure-diagnosis.ts) -- the mocked tests in
 * tests/phase2/sprint3/citation-failure-diagnosis.test.ts prove the pure
 * domain-comparison logic, but can't prove the SQL filters (run_number=1,
 * ORGANIC_ONLY, latest-completed-audit-only) actually hold against real
 * Postgres. ⚠️ DEV DB ONLY. Seeds and tears down real rows.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diagnose } from "@/lib/visibility/citation-failure-diagnosis";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
const TEST_ORG_ID = "7a11b000-7a11-4000-8a11-000000000001";

let client: ReturnType<typeof postgres>;

const brandIds: string[] = [];
const auditIds: string[] = [];

async function makeBrand(name: string, domain: string | null) {
  const [brand] = await client`
    INSERT INTO brands (organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${TEST_ORG_ID}, ${name}, ${domain ?? "placeholder-no-domain.invalid"}, 'tradies', 'au', ARRAY['NSW:Bondi'])
    RETURNING id
  `;
  if (domain === null) {
    // brands.domain is NOT NULL in the schema -- simulate "no domain on
    // record" the same way a real brand with an unparsed/empty domain
    // would: a value that reduces to no registrable domain at all.
    await client`UPDATE brands SET domain = '' WHERE id = ${brand.id}`;
  }
  brandIds.push(brand.id);
  return brand.id as string;
}

async function makeCompletedAudit(brandId: string, auditNumber: number, completedAt: Date) {
  const [audit] = await client`
    INSERT INTO audits (brand_id, organization_id, audit_number, status, engines, completed_at)
    VALUES (${brandId}, ${TEST_ORG_ID}, ${auditNumber}, 'complete', ARRAY['claude','perplexity'], ${completedAt})
    RETURNING id
  `;
  auditIds.push(audit.id);
  return audit.id as string;
}

async function insertCitation(opts: {
  auditId: string;
  engine: string;
  prompt: string;
  runNumber?: number;
  isBrandedPrompt?: boolean;
  citedSources: Array<{ domain: string; url: string; origin?: string }>;
}) {
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources)
    VALUES (${opts.auditId}, ${opts.engine}, ${opts.prompt}, ${opts.runNumber ?? 1}, false,
      ${opts.isBrandedPrompt ?? false}, ${JSON.stringify(opts.citedSources)})
  `;
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = TEST_DB_URL;
  client = postgres(TEST_DB_URL, { max: 1 });

  await client`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${TEST_ORG_ID}, 'cfbd-clerk', 'CFBD Org', 'cfbd-org') ON CONFLICT (id) DO NOTHING`;
});

afterAll(async () => {
  for (const id of auditIds) await client`DELETE FROM citations WHERE audit_id = ${id}`.catch(() => {});
  for (const id of auditIds) await client`DELETE FROM audits WHERE id = ${id}`.catch(() => {});
  for (const id of brandIds) await client`DELETE FROM brands WHERE id = ${id}`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${TEST_ORG_ID}`.catch(() => {});
  await client.end();
});

describe("checkBrandDomainNotCited via diagnose() -- real DB", () => {
  it("fires: real organic sources cited across engines, none is the brand's domain", async () => {
    const { db } = await import("@/db/client");
    const brandId = await makeBrand("CFBD Fires", "bondiplumbing.com.au");
    const auditId = await makeCompletedAudit(brandId, 90001, new Date());

    await insertCitation({
      auditId,
      engine: "claude",
      prompt: "best plumber",
      citedSources: [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }],
    });
    await insertCitation({
      auditId,
      engine: "perplexity",
      prompt: "emergency plumber",
      citedSources: [{ domain: "oneflare.com.au", url: "https://oneflare.com.au/b", origin: "retrieved" }],
    });

    const diagnoses = await diagnose(db, { brandId });
    const d = diagnoses.find((x) => x.patternKey === "brand_domain_not_cited");
    expect(d).toBeDefined();
    expect(d?.evidence).toContain("AI engines cited 2 sources across 2 engines, and none was your website.");
  });

  it("silent: the brand's own domain was cited", async () => {
    const { db } = await import("@/db/client");
    const brandId = await makeBrand("CFBD Cited", "bondiplumbing.com.au");
    const auditId = await makeCompletedAudit(brandId, 90002, new Date());

    await insertCitation({
      auditId,
      engine: "claude",
      prompt: "best plumber",
      citedSources: [
        { domain: "hipages.com.au", url: "https://hipages.com.au/a" },
        { domain: "bondiplumbing.com.au", url: "https://bondiplumbing.com.au/" },
      ],
    });

    const diagnoses = await diagnose(db, { brandId });
    expect(diagnoses.find((x) => x.patternKey === "brand_domain_not_cited")).toBeUndefined();
  });

  it("silent: brand's domain is the 9th distinct domain in one response -- regression guard against using top_domains (capped at 8)", async () => {
    const { db } = await import("@/db/client");
    const brandId = await makeBrand("CFBD Ninth", "bondiplumbing.com.au");
    const auditId = await makeCompletedAudit(brandId, 90003, new Date());

    const citedSources = [
      { domain: "d1.example.com", url: "https://d1.example.com" },
      { domain: "d2.example.com", url: "https://d2.example.com" },
      { domain: "d3.example.com", url: "https://d3.example.com" },
      { domain: "d4.example.com", url: "https://d4.example.com" },
      { domain: "d5.example.com", url: "https://d5.example.com" },
      { domain: "d6.example.com", url: "https://d6.example.com" },
      { domain: "d7.example.com", url: "https://d7.example.com" },
      { domain: "d8.example.com", url: "https://d8.example.com" },
      { domain: "bondiplumbing.com.au", url: "https://bondiplumbing.com.au/" }, // 9th
    ];
    await insertCitation({ auditId, engine: "claude", prompt: "top 9 plumbers", citedSources });

    const diagnoses = await diagnose(db, { brandId });
    expect(diagnoses.find((x) => x.patternKey === "brand_domain_not_cited")).toBeUndefined();
  });

  it("silent: brand has no domain on record -- never claims 'not cited' when it can't check", async () => {
    const { db } = await import("@/db/client");
    const brandId = await makeBrand("CFBD NoDomain", null);
    const auditId = await makeCompletedAudit(brandId, 90004, new Date());

    await insertCitation({
      auditId,
      engine: "claude",
      prompt: "best plumber",
      citedSources: [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }],
    });

    const diagnoses = await diagnose(db, { brandId });
    expect(diagnoses.find((x) => x.patternKey === "brand_domain_not_cited")).toBeUndefined();
  });

  it("silent: engines cited nothing at all -- the NO_CITATIONS_SOURCE_TYPE row covers that case instead", async () => {
    const { db } = await import("@/db/client");
    const brandId = await makeBrand("CFBD Empty", "bondiplumbing.com.au");
    const auditId = await makeCompletedAudit(brandId, 90005, new Date());

    await insertCitation({ auditId, engine: "claude", prompt: "best plumber", citedSources: [] });
    await insertCitation({ auditId, engine: "perplexity", prompt: "emergency plumber", citedSources: [] });

    const diagnoses = await diagnose(db, { brandId });
    expect(diagnoses.find((x) => x.patternKey === "brand_domain_not_cited")).toBeUndefined();
  });

  it("matches www./subdomain variants of the brand's registrable domain", async () => {
    const { db } = await import("@/db/client");
    const brandId = await makeBrand("CFBD Subdomain", "bondiplumbing.com.au");
    const auditId = await makeCompletedAudit(brandId, 90006, new Date());

    await insertCitation({
      auditId,
      engine: "claude",
      prompt: "best plumber",
      citedSources: [
        { domain: "hipages.com.au", url: "https://hipages.com.au/a" },
        { domain: "www.bondiplumbing.com.au", url: "https://www.bondiplumbing.com.au/contact" },
      ],
    });

    const diagnoses = await diagnose(db, { brandId });
    expect(diagnoses.find((x) => x.patternKey === "brand_domain_not_cited")).toBeUndefined();
  });

  it("excludes run_number > 1 (replay) rows: a replay-only brand citation does NOT suppress the diagnosis", async () => {
    const { db } = await import("@/db/client");
    const brandId = await makeBrand("CFBD Replay", "bondiplumbing.com.au");
    const auditId = await makeCompletedAudit(brandId, 90007, new Date());

    // Organic (run_number=1): real sources, never the brand's domain.
    await insertCitation({
      auditId,
      engine: "claude",
      prompt: "best plumber",
      runNumber: 1,
      citedSources: [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }],
    });
    // Replay (run_number=2) of the SAME prompt: cites the brand's own
    // domain. If replays weren't excluded, this would wrongly suppress
    // the diagnosis.
    await insertCitation({
      auditId,
      engine: "claude",
      prompt: "best plumber",
      runNumber: 2,
      citedSources: [{ domain: "bondiplumbing.com.au", url: "https://bondiplumbing.com.au/" }],
    });

    const diagnoses = await diagnose(db, { brandId });
    const d = diagnoses.find((x) => x.patternKey === "brand_domain_not_cited");
    expect(d).toBeDefined();
    expect(d?.evidence).toContain("AI engines cited 1 source across 1 engine, and none was your website.");
  });

  it("excludes branded-prompt rows: a branded-prompt-only brand citation does NOT suppress the diagnosis", async () => {
    const { db } = await import("@/db/client");
    const brandId = await makeBrand("CFBD Branded", "bondiplumbing.com.au");
    const auditId = await makeCompletedAudit(brandId, 90008, new Date());

    // Organic: real sources, never the brand's domain.
    await insertCitation({
      auditId,
      engine: "perplexity",
      prompt: "best plumber",
      isBrandedPrompt: false,
      citedSources: [{ domain: "oneflare.com.au", url: "https://oneflare.com.au/a" }],
    });
    // Branded prompt (e.g. "is Bondi Plumbing good?"): cites the brand's
    // own domain. If branded rows weren't excluded, this would wrongly
    // suppress the diagnosis.
    await insertCitation({
      auditId,
      engine: "perplexity",
      prompt: "is bondi plumbing good",
      isBrandedPrompt: true,
      citedSources: [{ domain: "bondiplumbing.com.au", url: "https://bondiplumbing.com.au/" }],
    });

    const diagnoses = await diagnose(db, { brandId });
    const d = diagnoses.find((x) => x.patternKey === "brand_domain_not_cited");
    expect(d).toBeDefined();
    expect(d?.evidence).toContain("AI engines cited 1 source across 1 engine, and none was your website.");
  });

  it("reads the latest completed audit only -- an older audit's state does not leak in", async () => {
    const { db } = await import("@/db/client");
    const brandId = await makeBrand("CFBD LatestOnly", "bondiplumbing.com.au");
    const olderAuditId = await makeCompletedAudit(brandId, 90009, new Date("2026-01-01"));
    const latestAuditId = await makeCompletedAudit(brandId, 90010, new Date("2026-06-01"));

    // Older audit: brand WAS cited (should NOT matter).
    await insertCitation({
      auditId: olderAuditId,
      engine: "claude",
      prompt: "best plumber",
      citedSources: [{ domain: "bondiplumbing.com.au", url: "https://bondiplumbing.com.au/" }],
    });
    // Latest audit: real sources, never the brand's domain.
    await insertCitation({
      auditId: latestAuditId,
      engine: "claude",
      prompt: "best plumber",
      citedSources: [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }],
    });

    const diagnoses = await diagnose(db, { brandId });
    const d = diagnoses.find((x) => x.patternKey === "brand_domain_not_cited");
    expect(d).toBeDefined();
    expect(d?.evidence).toContain("AI engines cited 1 source across 1 engine, and none was your website.");
  });
});

describe("competitor_cited_instead via diagnose() -- real competitor_mentioned column, no history mixing", () => {
  it("only counts the latest completed audit's competitor_mentioned rows", async () => {
    const { db } = await import("@/db/client");
    const brandId = await makeBrand("CFBD Competitor", "bondiplumbing.com.au");
    const olderAuditId = await makeCompletedAudit(brandId, 90011, new Date("2026-01-01"));
    const latestAuditId = await makeCompletedAudit(brandId, 90012, new Date("2026-06-01"));

    // Older audit: a different competitor, should NOT appear.
    await client`
      INSERT INTO comparison_prompt_results (brand_id, organization_id, audit_id, competitor_domain,
        prompt, engine, brand_won, brand_mentioned, competitor_mentioned)
      VALUES (${brandId}, ${TEST_ORG_ID}, ${olderAuditId}, 'stale-competitor.com.au',
        'best plumber', 'claude', false, false, true)
    `;
    // Latest audit: the real competitor, mentioned twice.
    for (let i = 0; i < 2; i++) {
      await client`
        INSERT INTO comparison_prompt_results (brand_id, organization_id, audit_id, competitor_domain,
          prompt, engine, brand_won, brand_mentioned, competitor_mentioned)
        VALUES (${brandId}, ${TEST_ORG_ID}, ${latestAuditId}, 'rivalplumbing.com.au',
          ${`prompt ${i}`}, 'claude', false, false, true)
      `;
    }
    // Latest audit: a brand_mentioned-but-not-competitor_mentioned row --
    // must not be counted.
    await client`
      INSERT INTO comparison_prompt_results (brand_id, organization_id, audit_id, competitor_domain,
        prompt, engine, brand_won, brand_mentioned, competitor_mentioned)
      VALUES (${brandId}, ${TEST_ORG_ID}, ${latestAuditId}, 'rivalplumbing.com.au',
        'brand only prompt', 'claude', true, true, false)
    `;

    const diagnoses = await diagnose(db, { brandId });
    const d = diagnoses.find((x) => x.patternKey === "competitor_cited_instead");
    expect(d).toBeDefined();
    expect(d?.competitorCited).toBe("rivalplumbing.com.au");
    expect(d?.evidence).toContain("rivalplumbing.com.au is cited 2 times");
    expect(diagnoses.some((x) => x.competitorCited === "stale-competitor.com.au")).toBe(false);
  });
});
