/**
 * Task #45: top cited domains per (engine, sourceType) card. Persisted
 * at aggregation time (buildCitationSourceIntelligence) into the new
 * top_domains column (migration 0039) -- exercised here against a real
 * Postgres since the aggregation logic, run_number filtering, and
 * jsonb round-trip can't be meaningfully verified with a mock. See
 * docs/ops/post-launch-db-hardening.md section 45.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCitationSourceIntelligence } from "@/lib/trust/citation-intelligence";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
const TEST_ORG_ID = "55004ea0-5555-4aaa-8bbb-000000000001";
const TEST_BRAND_ID = "55004ea0-5555-4aaa-8bbb-000000000002";
const AUDIT_1_ID = "55004ea0-5555-4aaa-8bbb-000000000003";
const AUDIT_2_ID = "55004ea0-5555-4aaa-8bbb-000000000004";

let client: ReturnType<typeof postgres>;

async function seed(
  auditId: string,
  engine: string,
  prompts: { text: string; citedSources: { domain: string; url: string; origin?: string }[] }[],
) {
  for (const { text, citedSources } of prompts) {
    for (let run = 1; run <= 5; run++) {
      await client`
        INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources)
        VALUES (${auditId}, ${engine}, ${text}, ${run}, false, false, ${JSON.stringify(citedSources)})
      `;
    }
  }
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.SERVICE_DATABASE_URL = TEST_DB_URL;
  client = postgres(TEST_DB_URL, { max: 1 });

  await client`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${TEST_ORG_ID}, 'csi-topdomains-clerk', 'CSI Top Domains Org', 'csi-topdomains') ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions) VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'CSI Top Domains Brand', 'bondiplumbing.com.au', 'tradies', 'au', ARRAY['NSW:Sydney']) ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, completed_at) VALUES (${AUDIT_1_ID}, ${TEST_BRAND_ID}, ${TEST_ORG_ID}, 301, 'complete', ARRAY['chatgpt'], NOW()) ON CONFLICT (id) DO NOTHING`;
  await client`INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, completed_at) VALUES (${AUDIT_2_ID}, ${TEST_BRAND_ID}, ${TEST_ORG_ID}, 302, 'complete', ARRAY['perplexity'], NOW()) ON CONFLICT (id) DO NOTHING`;
});

afterAll(async () => {
  await client`DELETE FROM citation_source_intelligence WHERE brand_id = ${TEST_BRAND_ID}`.catch(() => {});
  await client`DELETE FROM citations WHERE audit_id IN (${AUDIT_1_ID}, ${AUDIT_2_ID})`.catch(() => {});
  await client`DELETE FROM audits WHERE id IN (${AUDIT_1_ID}, ${AUDIT_2_ID})`.catch(() => {});
  await client`DELETE FROM brands WHERE id = ${TEST_BRAND_ID}`.catch(() => {});
  await client`DELETE FROM organizations WHERE id = ${TEST_ORG_ID}`.catch(() => {});
  await client.end();
});

describe("top_domains: counts, order, www/subdomain normalisation, brand flag, replay exclusion", () => {
  it("3 responses (+ 4 replays each) -> correct counts, sorted desc, www./subdomain stripped, brand flagged", async () => {
    const { db } = await import("@/db/client");

    await seed(AUDIT_1_ID, "chatgpt", [
      {
        text: "Prompt 1",
        citedSources: [
          { domain: "www.abcplumbing.com.au", url: "https://www.abcplumbing.com.au/a" }, // www. -- should normalise
          { domain: "xyzplumbers.com.au", url: "https://xyzplumbers.com.au/b" },
        ],
      },
      {
        text: "Prompt 2",
        citedSources: [
          { domain: "blog.abcplumbing.com.au", url: "https://blog.abcplumbing.com.au/c" }, // subdomain -- same registrable domain as prompt 1's
        ],
      },
      {
        text: "Prompt 3",
        citedSources: [{ domain: "bondiplumbing.com.au", url: "https://bondiplumbing.com.au/" }], // the brand's own domain
      },
    ]);

    const result = await buildCitationSourceIntelligence(db, AUDIT_1_ID, TEST_BRAND_ID, TEST_ORG_ID);

    // The brand's own domain classifies as brand_owned, not other -- a
    // separate (engine, sourceType) group/card.
    const other = result.find((r) => r.sourceType === "other");
    expect(other).toBeDefined();
    // 3 cited sources (www.abcplumbing, blog.abcplumbing, xyzplumbers)
    // across the 3 responses (replays excluded -- if run_number
    // filtering regressed this would be inflated 5x).
    expect(other?.citationCount).toBe(3);

    const domains = other?.topDomains ?? [];
    const abcEntry = domains.find((d) => d.domain === "abcplumbing.com.au");
    expect(abcEntry).toBeDefined(); // www. AND the subdomain both normalised to the same registrable domain
    expect(abcEntry?.count).toBe(2); // prompt 1's www. entry + prompt 2's subdomain entry

    const xyzEntry = domains.find((d) => d.domain === "xyzplumbers.com.au");
    expect(xyzEntry?.count).toBe(1);
    expect(abcEntry?.isBrand).toBeUndefined();

    // Sorted by count desc: abcplumbing.com.au (2) must come before the
    // 1-count entry.
    expect(domains[0].domain).toBe("abcplumbing.com.au");

    const brandOwned = result.find((r) => r.sourceType === "brand_owned");
    expect(brandOwned?.citationCount).toBe(1);
    const brandEntry = brandOwned?.topDomains.find((d) => d.domain === "bondiplumbing.com.au");
    expect(brandEntry?.isBrand).toBe(true);
  });

  it("caps at 8 domains even when more than 8 distinct domains are cited", async () => {
    const { db } = await import("@/db/client");

    const manyDomains = Array.from({ length: 10 }, (_, i) => ({
      domain: `site${i}.com.au`,
      url: `https://site${i}.com.au/`,
    }));
    await seed(AUDIT_1_ID, "chatgpt", [{ text: "Prompt with 10 domains", citedSources: manyDomains }]);

    const result = await buildCitationSourceIntelligence(db, AUDIT_1_ID, TEST_BRAND_ID, TEST_ORG_ID);
    const other = result.find((r) => r.sourceType === "other");

    expect(other?.topDomains.length).toBeLessThanOrEqual(8);
  });

  it("origin: a structured ('retrieved') Perplexity source is tagged retrieved in top_domains", async () => {
    const { db } = await import("@/db/client");

    await seed(AUDIT_2_ID, "perplexity", [
      {
        text: "Perplexity prompt",
        citedSources: [
          { domain: "hipages.com.au", url: "https://hipages.com.au/a", origin: "retrieved" },
        ],
      },
    ]);

    const result = await buildCitationSourceIntelligence(db, AUDIT_2_ID, TEST_BRAND_ID, TEST_ORG_ID);
    const auDir = result.find((r) => r.sourceType === "au_directory");

    expect(auDir?.topDomains[0]?.origin).toBe("retrieved");
  });
});
