/**
 * Playwright-run follow-ups (10 Nov), part 8 -- the Data Residency page listed the workspace's
 * data_residency_log rows, so a workspace without any (made before provisioning wrote them, or one whose
 * provisioning stopped part-way: E1 in the 9 Nov Playwright run) showed "Residency information loading…" for
 * good. The facts are the product's (lib/governance/residency-config.ts), so every workspace gets every one of
 * them; the rows add only when they were last written.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  // The app's own db client (getDataResidency's) connects through these, imported below after they're set.
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`itest-residency-${ORG_ID}`}, 'Residency test workspace', ${`itest-residency-${ORG_ID}`})
  `;
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM data_residency_log WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

describe("the Data Residency page's facts", () => {
  it("a workspace with no rows still gets every configured data type, never an empty list", async () => {
    const { getDataResidency } = await import("@/lib/governance/data-residency");
    const { RESIDENCY_CONFIG } = await import("@/lib/governance/residency-config");
    const entries = await getDataResidency(ORG_ID);
    expect(entries.map((e) => e.dataType)).toEqual(RESIDENCY_CONFIG.map((c) => c.dataType));
    expect(entries.every((e) => e.recordedAt === null)).toBe(true);
    const openai = entries.find((e) => e.dataType === "llm_processing_openai");
    expect(openai?.provider).toBe("openai");
  });

  it("once its rows are written, the same facts with when they were recorded", async () => {
    const { getDataResidency } = await import("@/lib/governance/data-residency");
    const { recordDataResidency } = await import("@/lib/governance/record-data-residency");
    const { RESIDENCY_CONFIG } = await import("@/lib/governance/residency-config");
    await recordDataResidency(ORG_ID);
    const entries = await getDataResidency(ORG_ID);
    expect(entries).toHaveLength(RESIDENCY_CONFIG.length);
    expect(entries.every((e) => e.recordedAt instanceof Date)).toBe(true);
  });
});
