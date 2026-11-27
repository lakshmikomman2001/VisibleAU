/**
 * S04 part 3 (LLD 8.4.3; amendment 84): a reach's new questions go into the brand's library as suggestions in that
 * reach -- never into its set -- each compared text once; a question already live is reused, and another workspace's
 * brand gets nothing.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
const ORG = randomUUID();
const OTHER = randomUUID();
const BRAND = randomUUID();

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  for (const org of [ORG, OTHER])
    await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${org}, ${`reach-sugg-${org}`}, 'Reach Suggestions Org', ${`reach-sugg-${org}`})`;
  await sql`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, state)
    VALUES (${BRAND}, ${ORG}, 'NumbaTek IT', 'numbatekit.example.com.au', 'professional_services', 'au', ARRAY[]::text[], 'NSW')`;
  await sql`INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source, reach, status)
    VALUES (${ORG}, ${BRAND}, 'Can you recommend managed IT services in NSW?',
            question_text_key('Can you recommend managed IT services in NSW?'), 'everyday', 'template', 'state', 'suggested')`;
});

afterAll(async () => {
  await sql`DELETE FROM brand_questions WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM organizations WHERE id IN (${ORG}, ${OTHER})`;
  await sql.end();
});

describe("addReachSuggestions", () => {
  it("suggestions in their reach, each text once, a live one reused; nothing in any set", async () => {
    const { serviceDb } = await import("@/db/client");
    const { addReachSuggestions } = await import("@/lib/reach/generate");
    const texts = [
      "Can you recommend managed IT services in NSW?",
      "Who is the best choice for managed IT services in NSW?",
    ];
    const ids = await serviceDb.transaction((tx) =>
      addReachSuggestions(tx, { organizationId: ORG, brandId: BRAND, reach: "state", texts }),
    );
    expect(ids).toHaveLength(2);
    const rows = await sql<
      { id: string; text: string; reach: string; status: string; source: string }[]
    >`
      SELECT id, text, reach, status, source FROM brand_questions WHERE brand_id = ${BRAND} ORDER BY created_at, text`;
    expect(rows.map(({ id: _id, ...r }) => r)).toEqual([
      { text: texts[0], reach: "state", status: "suggested", source: "template" },
      { text: texts[1], reach: "state", status: "suggested", source: "template" },
    ]);
    expect(new Set(ids)).toEqual(new Set(rows.map((r) => r.id)));
    const again = await serviceDb.transaction((tx) =>
      addReachSuggestions(tx, { organizationId: ORG, brandId: BRAND, reach: "state", texts }),
    );
    expect(again).toEqual(ids);
    expect(
      await sql`SELECT 1 FROM brand_question_set_items WHERE organization_id = ${ORG}`,
    ).toHaveLength(0);
    const elsewhere = await serviceDb.transaction((tx) =>
      addReachSuggestions(tx, { organizationId: OTHER, brandId: BRAND, reach: "state", texts }),
    );
    expect(elsewhere).toEqual([]);
  });
});
