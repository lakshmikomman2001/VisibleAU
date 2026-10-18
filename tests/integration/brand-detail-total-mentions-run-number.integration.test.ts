/**
 * Vunnara Build 1, Part F.3 -- real-DB proof that the brand detail
 * page's lifetime "totalMentions" KPI (app/(auth)/brands/[brandId]/
 * page.tsx) counts only run_number = 1 across every completed audit
 * the brand has ever had. Before this fix, a historical audit written
 * before Part F.1 removed the replay loop could have up to 5 rows per
 * real mention, inflating this lifetime count up to 5x.
 *
 * ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
 */
import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`bdtm-${ORG_ID}`}, 'Brand Detail Total Mentions Org', ${`bdtm-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'BDTM Co', 'bdtm.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, completed_at)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'complete', NOW())
  `;

  // Legacy-shaped audit: 2 real organic mentions (run_number=1) plus 4
  // byte-identical cache replays each (run_number 2-5), exactly the
  // shape a pre-Part-F.1 audit at runsPerPrompt=5 would have written.
  for (const prompt of ["Best plumber in Sydney?", "Who installs hot water systems?"]) {
    for (let run = 1; run <= 5; run++) {
      await client`
        INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
        VALUES (${AUDIT_ID}, 'chatgpt', ${prompt}, ${run}, true, false, ${client.json([])}, 'Response text')
      `;
    }
  }
});

afterAll(async () => {
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("brand detail page's lifetime totalMentions -- run_number = 1 only", () => {
  it("reproduces the exact query from app/(auth)/brands/[brandId]/page.tsx and gets 2, not 10", async () => {
    const { db } = await import("@/db/client");
    const { audits, citations } = await import("@/db/schema");

    const mentionRows = await db
      .select({ cnt: count() })
      .from(citations)
      .innerJoin(audits, eq(citations.auditId, audits.id))
      .where(
        and(
          eq(audits.brandId, BRAND_ID),
          eq(audits.status, "complete"),
          eq(citations.brandMentioned, true),
          ORGANIC_ONLY,
          eq(citations.runNumber, 1),
        ),
      );

    expect(Number(mentionRows[0]?.cnt ?? 0)).toBe(2);
  });

  it("without the run_number filter, the same query would have shown 10 (the pre-fix bug)", async () => {
    const { db } = await import("@/db/client");
    const { audits, citations } = await import("@/db/schema");

    const mentionRows = await db
      .select({ cnt: count() })
      .from(citations)
      .innerJoin(audits, eq(citations.auditId, audits.id))
      .where(
        and(
          eq(audits.brandId, BRAND_ID),
          eq(audits.status, "complete"),
          eq(citations.brandMentioned, true),
          ORGANIC_ONLY,
        ),
      );

    expect(Number(mentionRows[0]?.cnt ?? 0)).toBe(10);
  });
});
