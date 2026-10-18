/**
 * Vunnara hotfix 2 (19 Oct, post-609e323), item 4 -- real-DB proof
 * that getAuditPrompts regenerates a ready brand's frozen pack FIRST,
 * at audit-creation time, whenever its stamped generator version is
 * behind lib/prompts/generator-version.ts's PROMPT_GENERATOR_VERSION.
 * This is the only way a pack frozen by the OLD generator (duplicate
 * place names, the hipages mention, 12 organic instead of 10) ever
 * gets refreshed -- there's no natural re-save once a brand is
 * already confirmed.
 *
 * ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_STALE_ID = randomUUID();
const BRAND_CURRENT_ID = randomUUID();

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

// The exact shape the OLD generator (version 1) produced -- a
// duplicate place name, same class of bug Omega's real pack had.
const STALE_PACK = [
  "Best emergency plumber Bondi in Bondi, NSW?",
  "Reliable plumber Bondi available on weekends?",
];

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`c-regen2-${ORG_ID}`}, 'Regenerate v2 Test Org', ${`c-regen2-org-${ORG_ID}`})
  `;

  // Ready, but its pack was frozen by the generator as it existed
  // before this hotfix -- generator version 1 (the DEFAULT every
  // pre-existing row reads as, same as Omega on prod right now).
  await client`
    INSERT INTO brands (
      id, organization_id, name, domain, vertical, region, primary_regions, competitors,
      classification, classification_status, category_confirmed_at, categories, audience,
      location_mode, location_confirmed_at, suburb, city, state,
      prompt_pack, prompt_pack_version, prompt_pack_generator_version
    )
    VALUES (
      ${BRAND_STALE_ID}, ${ORG_ID}, 'Stale Pack Plumbing', 'stalepack.example.com.au', 'tradies', 'au', ARRAY['NSW:Bondi'], ARRAY[]::text[],
      ${client.json(CLASSIFICATION)}, 'complete', now(), ARRAY['trades_plumbing'], 'households',
      'fixed', now(), 'Bondi', 'Sydney', 'NSW',
      ${client.json(STALE_PACK)}, 3, 1
    )
  `;

  // Ready, and already stamped with the current generator version --
  // regeneration must be a true no-op for this one.
  await client`
    INSERT INTO brands (
      id, organization_id, name, domain, vertical, region, primary_regions, competitors,
      classification, classification_status, category_confirmed_at, categories, audience,
      location_mode, location_confirmed_at, suburb, city, state,
      prompt_pack, prompt_pack_version, prompt_pack_generator_version
    )
    VALUES (
      ${BRAND_CURRENT_ID}, ${ORG_ID}, 'Current Pack Plumbing', 'currentpack.example.com.au', 'tradies', 'au', ARRAY['NSW:Bondi'], ARRAY[]::text[],
      ${client.json(CLASSIFICATION)}, 'complete', now(), ARRAY['trades_plumbing'], 'households',
      'fixed', now(), 'Bondi', 'Sydney', 'NSW',
      ${client.json(STALE_PACK)}, 5, 2
    )
  `;
});

afterAll(async () => {
  const brandIds = [BRAND_STALE_ID, BRAND_CURRENT_ID];
  await client`DELETE FROM brands WHERE id = ANY(${brandIds})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function getBrandRow(id: string) {
  const [row] = await client`SELECT * FROM brands WHERE id = ${id}`;
  return row;
}

// Dynamic imports (after beforeAll sets DATABASE_URL/SERVICE_DATABASE_URL),
// matching regenerate-prompt-pack.integration.test.ts's own pattern.
async function callGetAuditPrompts(brandId: string) {
  const { getAuditPrompts } = await import("@/lib/audit/get-audit-prompts");
  const row = await getBrandRow(brandId);
  const brand = {
    ...row,
    categories: row.categories,
    competitors: row.competitors,
    primaryRegions: row.primary_regions,
    classificationStatus: row.classification_status,
    categoryConfirmedAt: row.category_confirmed_at,
    locationMode: row.location_mode,
    locationConfirmedAt: row.location_confirmed_at,
    promptPack: row.prompt_pack,
    promptPackVersion: row.prompt_pack_version,
    promptPackGeneratorVersion: row.prompt_pack_generator_version,
  };
  return getAuditPrompts(brand as never, 10);
}

describe("getAuditPrompts -- regenerates a stale-generator pack first (hotfix 2, item 4)", () => {
  it("a pack stamped with an older generator version is regenerated at audit start", async () => {
    const before = await getBrandRow(BRAND_STALE_ID);
    expect(before.prompt_pack_generator_version).toBe(1);
    expect(before.prompt_pack).toEqual(STALE_PACK);

    const prompts = await callGetAuditPrompts(BRAND_STALE_ID);

    const after = await getBrandRow(BRAND_STALE_ID);
    expect(after.prompt_pack_generator_version).toBe(2);
    // The real generator's output, not the stale duplicate-place pack.
    expect(after.prompt_pack).not.toEqual(STALE_PACK);
    expect(after.prompt_pack_version).toBeGreaterThan(before.prompt_pack_version);
    // Never names "Bondi" twice.
    for (const text of after.prompt_pack as string[]) {
      expect(text).not.toMatch(/\bBondi\b.*\bBondi\b/i);
    }
    // getAuditPrompts itself returned the FRESH pack, not the stale one.
    expect(prompts.map((p) => p.text)).toEqual(after.prompt_pack);
  });

  it("a pack already stamped with the current generator version is NOT regenerated", async () => {
    const before = await getBrandRow(BRAND_CURRENT_ID);
    expect(before.prompt_pack_generator_version).toBe(2);

    await callGetAuditPrompts(BRAND_CURRENT_ID);

    const after = await getBrandRow(BRAND_CURRENT_ID);
    expect(after.prompt_pack_version).toBe(before.prompt_pack_version);
    expect(after.prompt_pack).toEqual(before.prompt_pack);
  });
});
