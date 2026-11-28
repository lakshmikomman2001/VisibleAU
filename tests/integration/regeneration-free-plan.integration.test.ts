/**
 * S04B part 5 (LLD amendment 101): amendment 84 (a set a person applied survives a regeneration; the new questions
 * arrive as suggestions) is for Starter and up. A Free brand can't act on suggestions, so its set follows amendment 74 --
 * a regeneration writes the next version -- even when a person's set (the confirm step's) is current. The plan at the
 * time of the regeneration decides: a workspace that has dropped to Free since is Free.
 * Real database, the real regeneratePromptPack, invented businesses.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const FREE_ORG = randomUUID();
const STARTER_ORG = randomUUID();
const users: Record<string, string> = { [FREE_ORG]: randomUUID(), [STARTER_ORG]: randomUUID() };
let client: ReturnType<typeof postgres>;

const CLASSIFICATION = {
  category: "trades_plumbing",
  buyerType: "consumer",
  competitors: [],
  confidence: 0.95,
  intentSignals: [],
  auRelevance: "au_present",
};

/** Questions an older generator wrote (none of them today's templates), so a regeneration changes the pack. */
function olderPack(name: string): string[] {
  return [
    "Who is the top plumber around Kurrajong Heights right now?",
    "Plumbers in Kurrajong Heights who answer the phone on weekends?",
    "Which Kurrajong Heights plumbing firms have five star reviews?",
    "Who can fix a burst pipe in Kurrajong Heights tonight?",
    "Cheapest licensed plumber servicing Kurrajong Heights?",
    "Who replaces hot water units in Kurrajong Heights homes?",
    "Which Kurrajong Heights plumber does gas fitting as well?",
    "Who clears tree roots from drains in Kurrajong Heights?",
    "Recommended bathroom renovation plumber in Kurrajong Heights?",
    "Which plumber near Kurrajong Heights offers a fixed call-out fee?",
    `Is ${name} a good plumber in Kurrajong Heights?`,
    `What do people say about ${name}?`,
  ];
}

/** A brand whose current set a person applied (version 2, as the confirm step or P04 saves it). */
async function brandWithPersonsSet(org: string, name: string): Promise<string> {
  const id = randomUUID();
  const pack = olderPack(name);
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, city, state,
                        postcode, location_mode, location_confirmed_at, classification_status, classification,
                        categories, audience, category_confirmed_at, prompt_pack, prompt_pack_version,
                        prompt_pack_generator_version)
    VALUES (${id}, ${org}, ${name}, ${`${id.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
            ARRAY['NSW:Kurrajong Heights'], 'Kurrajong Heights', 'Sydney', 'NSW', '2758', 'fixed', now(), 'complete',
            ${client.json(CLASSIFICATION)}, ARRAY['trades_plumbing'], 'households', now(), ${client.json(pack)}, 1,
            ${PROMPT_GENERATOR_VERSION})`;
  const { serviceDb } = await import("@/db/client");
  const { writeSetFromPack } = await import("@/lib/questions/question-set-store");
  await serviceDb.transaction((tx) =>
    writeSetFromPack(tx, { brandId: id, pack, note: "Original" }),
  );
  await client`UPDATE brand_question_sets SET applied_by = ${users[org]} WHERE brand_id = ${id} AND is_current`;
  return id;
}

async function current(brandId: string) {
  const [row] = await client<{ version: number; applied_by: string | null }[]>`
    SELECT version, applied_by FROM brand_question_sets WHERE brand_id = ${brandId} AND is_current`;
  return row;
}

/** A move to another suburb, then the regeneration every location-changing caller makes. */
async function moveAndRegenerate(brandId: string) {
  await client`UPDATE brands SET suburb = 'Wattle Grove', postcode = '2173', primary_regions = ARRAY['NSW:Wattle Grove']
    WHERE id = ${brandId}`;
  const { serviceDb } = await import("@/db/client");
  const { regeneratePromptPack } = await import("@/lib/prompts/regenerate-prompt-pack");
  return regeneratePromptPack(serviceDb, brandId);
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  for (const org of [FREE_ORG, STARTER_ORG]) {
    await client`INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${org}, ${`regen-free-${org}`}, 'Regeneration Plan Org', ${`regen-free-${org}`})`;
    await client`INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${users[org]}, ${`regen-free-${users[org]}`}, ${org}, ${`owner-${users[org].slice(0, 8)}@regenplan.example.com.au`}, 'Owner', 'owner')`;
  }
  await client`INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
                                          tier, billing_interval, status)
    VALUES (${STARTER_ORG}, ${`cus_${STARTER_ORG}`}, ${`sub_${STARTER_ORG}`}, 'price_test', 'starter', 'monthly', 'active')`;
}, 60_000);

afterAll(async () => {
  for (const org of [FREE_ORG, STARTER_ORG]) {
    await deleteOrgRows(client, org);
    await client`DELETE FROM users WHERE id = ${users[org]}`;
  }
  await client.end();
});

describe("a person's set and a regeneration, by plan (amendment 101)", () => {
  it("Free: the regeneration writes the next version (amendment 74), though a person's set was current", async () => {
    const brandId = await brandWithPersonsSet(FREE_ORG, "Gum Tree Plumbing");
    expect(await current(brandId)).toMatchObject({ version: 1, applied_by: users[FREE_ORG] });
    const result = await moveAndRegenerate(brandId);
    expect(result?.outcome).toBe("new_version");
    expect((await current(brandId)).version).toBe(2);
  });

  it("Starter: the person's set is kept and the new questions are suggestions (amendment 84)", async () => {
    const brandId = await brandWithPersonsSet(STARTER_ORG, "Ironbark Plumbing");
    const result = await moveAndRegenerate(brandId);
    expect(result?.outcome).toBe("set_kept");
    expect(await current(brandId)).toMatchObject({ version: 1, applied_by: users[STARTER_ORG] });
  });

  it("the plan at the time of the regeneration decides: a workspace now on Free gets the next version", async () => {
    const brandId = await brandWithPersonsSet(STARTER_ORG, "Wattle Creek Plumbing");
    await client`UPDATE subscriptions SET status = 'canceled' WHERE organization_id = ${STARTER_ORG}`;
    try {
      const result = await moveAndRegenerate(brandId);
      expect(result?.outcome).toBe("new_version");
      expect((await current(brandId)).version).toBe(2);
    } finally {
      await client`UPDATE subscriptions SET status = 'active' WHERE organization_id = ${STARTER_ORG}`;
    }
  });
});
