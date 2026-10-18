/**
 * Vunnara Build 1, Part E.1/E.2 -- real-DB proof that
 * regeneratePromptPack:
 * (a) is a no-op until the brand is BOTH classification-complete AND
 *     location-confirmed (never generates a pack from half-settled
 *     facts);
 * (b) generates a pack at version 1 the first time it becomes ready;
 * (c) bumps the version on every subsequent regeneration, never on
 *     the first.
 *
 * ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_NOT_CLASSIFIED_ID = randomUUID();
const BRAND_NO_LOCATION_ID = randomUUID();
const BRAND_READY_ID = randomUUID();

let client: ReturnType<typeof postgres>;

const CLASSIFICATION = {
  category: "trades_plumbing",
  buyerType: "consumer",
  audience: "households",
  intentSignals: ["24 hour plumber Bondi"],
  competitors: [],
  auRelevance: "au_present",
  confidence: 0.9,
};

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`c-regen-${ORG_ID}`}, 'Regenerate Pack Test Org', ${`c-regen-org-${ORG_ID}`})
  `;

  // Classified but needs_confirmation -- not ready.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors, classification, classification_status)
    VALUES (${BRAND_NOT_CLASSIFIED_ID}, ${ORG_ID}, 'Not Classified Co', 'notclassified.example.com.au', 'tradies', 'au', ARRAY[]::text[], ARRAY[]::text[], ${client.json(CLASSIFICATION)}, 'needs_confirmation')
  `;

  // Classification complete, but no location confirmed -- not ready.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors, classification, classification_status)
    VALUES (${BRAND_NO_LOCATION_ID}, ${ORG_ID}, 'No Location Co', 'nolocation.example.com.au', 'tradies', 'au', ARRAY[]::text[], ARRAY[]::text[], ${client.json(CLASSIFICATION)}, 'complete')
  `;

  // Classification complete AND location confirmed -- ready.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors, classification, classification_status, location_mode, suburb, city, state)
    VALUES (${BRAND_READY_ID}, ${ORG_ID}, 'Ready Plumbing Co', 'readyplumbing.example.com.au', 'tradies', 'au', ARRAY['NSW:Bondi'], ARRAY[]::text[], ${client.json(CLASSIFICATION)}, 'complete', 'fixed', 'Bondi', 'Sydney', 'NSW')
  `;
});

afterAll(async () => {
  const brandIds = [BRAND_NOT_CLASSIFIED_ID, BRAND_NO_LOCATION_ID, BRAND_READY_ID];
  await client`DELETE FROM brands WHERE id = ANY(${brandIds})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function getBrandRow(id: string) {
  const [row] = await client`SELECT * FROM brands WHERE id = ${id}`;
  return row;
}

// Dynamic imports (after beforeAll sets DATABASE_URL/SERVICE_DATABASE_URL),
// matching tests/integration/classify-and-store.integration.test.ts's
// own pattern -- a static top-level import would instantiate serviceDb's
// connection before those env vars are set.
async function regenerate(brandId: string): Promise<void> {
  const { serviceDb } = await import("@/db/client");
  const { regeneratePromptPack } = await import("@/lib/prompts/regenerate-prompt-pack");
  await regeneratePromptPack(serviceDb, brandId);
}

describe("regeneratePromptPack", () => {
  it("is a no-op when classification is not yet complete", async () => {
    await regenerate(BRAND_NOT_CLASSIFIED_ID);
    const row = await getBrandRow(BRAND_NOT_CLASSIFIED_ID);
    expect(row.prompt_pack).toBeNull();
  });

  it("is a no-op when classification is complete but no location is confirmed", async () => {
    await regenerate(BRAND_NO_LOCATION_ID);
    const row = await getBrandRow(BRAND_NO_LOCATION_ID);
    expect(row.prompt_pack).toBeNull();
  });

  it("generates a pack at version 1 the first time the brand is ready", async () => {
    await regenerate(BRAND_READY_ID);
    const row = await getBrandRow(BRAND_READY_ID);
    expect(Array.isArray(row.prompt_pack)).toBe(true);
    expect(row.prompt_pack.length).toBeGreaterThan(0);
    expect(row.prompt_pack_version).toBe(1);
  });

  // Vunnara hotfix (18 Oct, post-df27ef8): the version churn bug --
  // every call used to bump the version unconditionally once a pack
  // existed, even calling it twice in a row with nothing changed
  // (Omega reached version 12 this way, across confirm-classification,
  // then the location PATCH, then further edits -- none of which
  // individually changed the actual questions each time). The pack is
  // built deterministically (seededShuffle keyed on brand.id) from the
  // same stored inputs both times, so it's byte-identical -- no bump.
  it("regenerating twice with nothing changed does NOT bump the version (idempotent)", async () => {
    await regenerate(BRAND_READY_ID);
    const row = await getBrandRow(BRAND_READY_ID);
    const versionAfterFirst = row.prompt_pack_version;
    const packAfterFirst = row.prompt_pack;

    await regenerate(BRAND_READY_ID);
    const row2 = await getBrandRow(BRAND_READY_ID);
    expect(row2.prompt_pack_version).toBe(versionAfterFirst);
    expect(row2.prompt_pack).toEqual(packAfterFirst);
  });

  it("bumps the version when a real input (a confirmed competitor) actually changes the pack", async () => {
    const before = await getBrandRow(BRAND_READY_ID);
    const versionBefore = before.prompt_pack_version;

    await client`UPDATE brands SET competitors = ARRAY['Eastern Plumbing Co'] WHERE id = ${BRAND_READY_ID}`;
    await regenerate(BRAND_READY_ID);

    const after = await getBrandRow(BRAND_READY_ID);
    expect(after.prompt_pack_version).toBe(versionBefore + 1);
    expect(after.prompt_pack).not.toEqual(before.prompt_pack);
  });

  it("the generated pack has no business-owner phrasing for this households-audience brand", async () => {
    await regenerate(BRAND_READY_ID);
    const row = await getBrandRow(BRAND_READY_ID);
    for (const text of row.prompt_pack as string[]) {
      expect(text).not.toMatch(/for Australian (small )?businesses/i);
    }
  });
});
