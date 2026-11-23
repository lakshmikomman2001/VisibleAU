/**
 * S01 part 6 (LLD 8.1.4): getBeyondAiAnswers reads each module's latest result at or before the report's time.
 * - A result written after asOf is ignored (a report keeps what was true when it was generated).
 * - Crawler visits: the 30 days before asOf, by crawler.
 * - The PDF's directory tile: the basis audit's cited directories and the brand's linked profiles.
 * - RLS: another workspace sees none of it.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { sql as dsql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { assertLocalSafeDatabaseUrl } from "@/scripts/db/local-db-guard";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

/** As the app's own NOBYPASSRLS role: the local test user is a superuser, which bypasses RLS (as in
 * brand-directory-listings.integration.test.ts). Documented local dev password (scripts/db/tier1a-app-role.sql). */
function appRoleUrl(): string {
  const base = new URL(getTestDatabaseUrl());
  base.username = "visibleau_app";
  base.password = "visibleau_app_dev";
  const url = base.toString();
  assertLocalSafeDatabaseUrl(url);
  return url;
}

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let fx: ReportFixture;
let otherOrg = "";

const AS_OF = new Date("2026-11-24T00:00:00Z");

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  fx = await seedReportFixture(sql, {
    brandName: "TechCore IT",
    tier: "agency",
    agencyName: "Splice Marketing",
    audits: [
      {
        number: 52,
        completedAt: "2026-11-20T03:00:00.000Z",
        mentions: {},
        directories: {
          "localbusinessguide.com.au": 14,
          "yellowpages.com.au": 3,
          "kangaroo-it.com.au": 9,
        },
      },
    ],
  });
  await sql`UPDATE brands SET abn = '17701710947' WHERE id = ${fx.brandId}`;
  // Identity: one before asOf, one after (must be ignored).
  for (const [status, entity, at] of [
    ["Active", "ASTORIO GROUP PTY LTD", "2026-11-22T01:00:00Z"],
    ["Cancelled", "LATER PTY LTD", "2026-11-25T01:00:00Z"],
  ] as const) {
    await sql`INSERT INTO brand_entity_scores (brand_id, organization_id, abn_verified, abn_number, abn_entity_name,
        abn_status, wikipedia_au_present, au_tld_domains, checked_at)
      VALUES (${fx.brandId}, ${fx.orgId}, ${status === "Active"}, '17701710947', ${entity}, ${status}, false,
        ${sql.json(["x.com.au"])}, ${at})`;
  }
  await sql`INSERT INTO youtube_presence_audits (brand_id, organization_id, check_status, channel_title,
      channel_total_videos, last_upload_at, audited_at)
    VALUES (${fx.brandId}, ${fx.orgId}, 'confirmed', 'TechCore IT', 14, '2026-11-02T00:00:00Z', '2026-11-21T00:00:00Z')`;
  const robots = {
    scoringVersion: 4,
    robots: {
      present: true,
      aiBotsAllowed: ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Googlebot"],
      aiBotsBlocked: [],
      fetchStatus: "found",
    },
  };
  for (const [score, at] of [
    ["38.00", "2026-11-22T02:00:00Z"],
    ["70.00", "2026-11-26T02:00:00Z"],
  ] as const) {
    await sql`INSERT INTO technical_audits (brand_id, organization_id, score_composite, score_schema, score_meta,
        findings, created_at)
      VALUES (${fx.brandId}, ${fx.orgId}, ${score}, '2.00', '6.00', ${sql.json(robots)}, ${at})`;
  }
  // Visits: two inside the 30 days before asOf, one 40 days before, one after.
  for (const [bot, at] of [
    ["OAI-SearchBot", "2026-11-20T00:00:00Z"],
    ["OAI-SearchBot", "2026-11-10T00:00:00Z"],
    ["Googlebot", "2026-10-15T00:00:00Z"],
    ["ClaudeBot", "2026-11-25T00:00:00Z"],
  ] as const) {
    await sql`INSERT INTO crawler_visit_logs (brand_id, organization_id, crawler_name, crawler_tier, visited_url,
        visited_at, ingest_source)
      VALUES (${fx.brandId}, ${fx.orgId}, ${bot}, 'tier1', '/', ${at}, 'log_upload')`;
  }
  // The owner linked their Yellow Pages profile.
  await sql`INSERT INTO brand_directory_listings (organization_id, brand_id, directory_key, status, profile_url,
      confirmed_at)
    VALUES (${fx.orgId}, ${fx.brandId}, 'yellow_pages_au', 'listed', 'https://www.yellowpages.com.au/nsw/x/techcore', now())`;
  const [other] = await sql<{ id: string }[]>`
    INSERT INTO organizations (clerk_org_id, name, slug)
    VALUES (${`beyond-other-${fx.orgId.slice(0, 8)}`}, 'Other', ${`beyond-other-${fx.orgId.slice(0, 8)}`})
    RETURNING id`;
  otherOrg = other.id;
}, 60_000);

afterAll(async () => {
  for (const table of [
    "brand_entity_scores",
    "youtube_presence_audits",
    "technical_audits",
    "crawler_visit_logs",
  ]) {
    await sql`DELETE FROM ${sql(table)} WHERE brand_id = ${fx.brandId}`;
  }
  await fx.cleanup();
  await sql`DELETE FROM organizations WHERE id = ${otherOrg}`;
  await sql.end();
});

async function brandRow() {
  const [brand] = await sql<
    Array<{
      id: string;
      name: string;
      domain: string;
      region: string;
      categories: string[];
      abn: string | null;
    }>
  >`SELECT id, name, domain, region, categories, abn FROM brands WHERE id = ${fx.brandId}`;
  return { ...brand, youtubeChannelUrl: null };
}

async function load(orgId: string, asOf: Date, withBasis = true) {
  const { withRlsContext } = await import("@/db/client");
  const { getBeyondAiAnswers } = await import("@/lib/reports/beyond-ai");
  const brand = await brandRow();
  return withRlsContext(orgId, (tx) =>
    getBeyondAiAnswers(tx, { brand, asOf, basisAuditId: withBasis ? fx.audits[52] : null }),
  );
}

/** The same read as visibleau_app (RLS enforced), in one transaction with the workspace set. */
async function loadAsAppRole(orgId: string, asOf: Date) {
  const { getBeyondAiAnswers } = await import("@/lib/reports/beyond-ai");
  const brand = await brandRow();
  const client = postgres(appRoleUrl(), { max: 1 });
  try {
    return await drizzle(client, { schema }).transaction(async (tx) => {
      await tx.execute(dsql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
      return getBeyondAiAnswers(tx, { brand, asOf, basisAuditId: fx.audits[52] });
    });
  } finally {
    await client.end();
  }
}

describe("getBeyondAiAnswers", () => {
  it("reads each module's latest result at or before asOf, never one written after it", async () => {
    const a = await load(fx.orgId, AS_OF);
    expect(a.identity).toMatchObject({
      status: "measured",
      abnVerified: true,
      entity: "ASTORIO GROUP PTY LTD",
    });
    expect(a.identity.checkedAt).toBe("2026-11-22T01:00:00.000Z");
    expect(a.technical).toMatchObject({ status: "measured", score: 38, max: 74 });
    expect(a.youtube).toMatchObject({ status: "measured", state: "found", videos: 14 });
    expect(a.crawlers).toMatchObject({
      status: "measured",
      searchAllowed: expect.any(Array),
      total: 4,
    });
    expect(a.crawlers.searchAllowed).toHaveLength(4);
  });

  it("a later report sees the later results", async () => {
    const a = await load(fx.orgId, new Date("2026-11-27T00:00:00Z"));
    expect(a.identity.entity).toBe("LATER PTY LTD");
    expect(a.technical.score).toBe(70);
  });

  it("crawler visits: the 30 days before asOf, by crawler", async () => {
    const a = await load(fx.orgId, AS_OF);
    expect(a.crawlers.visits).toEqual({
      status: "measured",
      total: 2,
      byCrawler: [{ name: "OAI-SearchBot", visits: 2 }],
    });
  });

  it("the directory tile comes from the basis audit's citations and the linked profiles", async () => {
    const a = await load(fx.orgId, AS_OF);
    expect(a.directories).not.toBeNull();
    expect(a.directories?.items.map((i) => [i.name, i.linked, i.citedIn])).toEqual([
      ["Local Business Guide", false, 14],
      ["Yellow Pages", true, 3],
    ]);
    expect(a.directories).toMatchObject({ linked: 1, cited: 2 });
    expect((await load(fx.orgId, AS_OF, false)).directories).toBeNull();
  });

  it("RLS (as visibleau_app): the brand's own workspace reads its results; another workspace reads nothing", async () => {
    const own = await loadAsAppRole(fx.orgId, AS_OF);
    expect(own.identity.status).toBe("measured");
    expect(own.technical.score).toBe(38);
    const other = await loadAsAppRole(otherOrg, AS_OF);
    expect(other.identity.status).toBe("not_checked");
    expect(other.youtube.state).toBe("not_linked");
    expect(other.technical.status).toBe("not_checked");
    expect(other.crawlers.visits.status).toBe("not_measured");
    expect(other.directories).toMatchObject({ linked: 0, cited: 0 });
  });
});
