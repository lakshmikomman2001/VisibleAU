/**
 * S04 part 0a (LLD amendment 84; 8.2.1): a set a person applied survives a regeneration. Real database, the real brand
 * PATCH route, both real audit runners and a stubbed engine. Invented businesses, each with questions an older
 * generator wrote (version 1, written by the app) that a person then changed (version 2, applied by a user):
 * - a rename, a location change (PATCH /api/brands/:id) and a newer generator (at the audit start, both runners) each
 *   keep the version and the hash; the regenerated questions arrive once as suggestions (a second audit start adds
 *   none and doesn't regenerate); the brand's generator version is stamped; the Questions page's banner shows
 *   (loadQuestionsView.regeneratedSuggestions) until a new version is applied; brand settings hears "questions_kept";
 * - after a rename the old name's questions stay shown and never counted (N4) and the audit's hash is the set's;
 * - on a brand nobody changed (amendment 74, as before) each still writes the next version, and the next audit asks it;
 * - an audit that is running when the pack is regenerated keeps the set it started with (both runners).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Engine } from "@/lib/llm/interface";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/brand-entity/wikipedia-au", async (importOriginal) =>
  (await import("@/tests/helpers/recorded-network")).recordedWikipedia(importOriginal),
);

const ORG = randomUUID();
const OWNER = randomUUID();
const current = vi.hoisted(() => ({ user: { id: "", organizationId: "", role: "owner" } }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn(async () => current.user) }));

/** Called on an audit's first engine call when set: a regeneration while the audit runs. */
const midRun = vi.hoisted(() => ({ hook: null as null | (() => Promise<void>) }));

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    getLLMService: (engine: Engine = "chatgpt") => ({
      complete: async ({ prompt }: { prompt: string }) => {
        const hook = midRun.hook;
        if (hook) {
          midRun.hook = null;
          await hook();
        }
        return {
          response:
            prompt.length % 2 === 0
              ? "Here are some options:\n1. Bilby Trades\n2. Another Local Co"
              : "Here are some options:\n1. Another Local Co",
          model: `${engine}-model`,
          tokensUsed: 100,
          costEstimateUsd: 0.001,
          costSource: "price_table" as const,
          isCacheHit: false,
        };
      },
    }),
  };
});

const step = {
  run: (_name: string, fn: () => unknown) => fn(),
  sendEvent: async () => ({ ids: [] }),
};

let client: ReturnType<typeof postgres>;

const CLASSIFICATION = {
  category: "trades_plumbing",
  buyerType: "consumer",
  competitors: [],
  confidence: 0.95,
  intentSignals: [],
  auRelevance: "au_present",
};

/** Questions an older generator wrote for a plumber in {place} named {name} (none of them today's templates). */
function olderPack(name: string, place: string): string[] {
  return [
    `Who is the top plumber around ${place} right now?`,
    `Plumbers in ${place} who answer the phone on weekends?`,
    `Which ${place} plumbing firms have five star reviews?`,
    `Who can fix a burst pipe in ${place} tonight?`,
    `Cheapest licensed plumber servicing ${place}?`,
    `Who replaces hot water units in ${place} homes?`,
    `Which ${place} plumber does gas fitting as well?`,
    `Who clears tree roots from drains in ${place}?`,
    `Recommended bathroom renovation plumber in ${place}?`,
    `Which plumber near ${place} offers a fixed call-out fee?`,
    `Is ${name} a good plumber in ${place}?`,
    `What do people say about ${name}?`,
    `Is ${name} better than Another Local Co?`,
  ];
}

interface TestBrand {
  id: string;
  name: string;
}
const brandsMade: TestBrand[] = [];

async function makeBrand(
  name: string,
  opts: { applied: boolean; staleGenerator?: boolean },
): Promise<TestBrand> {
  const id = randomUUID();
  const pack = olderPack(name, "Chatswood");
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, city, state,
                        postcode, location_mode, location_confirmed_at, classification_status, classification,
                        categories, audience, category_confirmed_at, prompt_pack, prompt_pack_version,
                        prompt_pack_generator_version)
    VALUES (${id}, ${ORG}, ${name}, ${`${id.slice(0, 8)}.example.com.au`}, 'tradies', 'au', ARRAY['NSW:Chatswood'],
            'Chatswood', 'Sydney', 'NSW', '2067', 'fixed', now(), 'complete', ${client.json(CLASSIFICATION)},
            ARRAY['trades_plumbing'], 'households', now(), ${client.json(pack)}, 1,
            ${opts.staleGenerator ? PROMPT_GENERATOR_VERSION - 1 : PROMPT_GENERATOR_VERSION})`;
  const { serviceDb } = await import("@/db/client");
  const { writeSetFromPack } = await import("@/lib/questions/question-set-store");
  // Version 1, as the app wrote it (applied_by empty).
  await serviceDb.transaction((tx) =>
    writeSetFromPack(tx, { brandId: id, pack, note: "The regenerated question pack" }),
  );
  if (opts.applied) {
    // Version 2: a person removed the last everyday question (P04's apply).
    const { applyQuestionSet } = await import("@/lib/questions/apply");
    const items = await client<{ question_id: string; kind: string; position: number }[]>`
      SELECT i.question_id, i.kind, i.position FROM brand_question_set_items i
      JOIN brand_question_sets s ON s.id = i.set_id AND s.is_current WHERE s.brand_id = ${id} ORDER BY i.position`;
    const keep = items.filter((i) => i.position !== 9);
    const r = await serviceDb.transaction((tx) =>
      applyQuestionSet(tx, {
        organizationId: ORG,
        brandId: id,
        userId: OWNER,
        baseVersion: 1,
        items: keep.map((i, position) => ({
          questionId: i.question_id,
          reach: "local" as const,
          position,
        })),
      }),
    );
    expect(r.ok).toBe(true);
  }
  const b = { id, name };
  brandsMade.push(b);
  return b;
}

async function currentSet(brandId: string) {
  const [row] = await client<
    { id: string; version: number; comparison_hash: string; applied_by: string | null }[]
  >`SELECT id, version, comparison_hash, applied_by FROM brand_question_sets WHERE brand_id = ${brandId} AND is_current`;
  return row;
}
async function setTexts(setId: string): Promise<string[]> {
  return (
    await client<{ text: string }[]>`
      SELECT q.text FROM brand_question_set_items i JOIN brand_questions q ON q.id = i.question_id
      WHERE i.set_id = ${setId} ORDER BY i.position`
  ).map((r) => r.text);
}
async function versions(brandId: string): Promise<number> {
  const [{ n }] = await client<{ n: number }[]>`
    SELECT count(*)::int AS n FROM brand_question_sets WHERE brand_id = ${brandId}`;
  return n;
}
async function regenerated(brandId: string) {
  return client<{ text: string; kind: string; source: string; status: string }[]>`
    SELECT text, kind, source, status FROM brand_questions
    WHERE brand_id = ${brandId} AND archived_at IS NULL AND reasons @> '[{"type":"regenerated"}]'::jsonb
    ORDER BY created_at, text`;
}
async function generatorVersion(brandId: string): Promise<number> {
  const [row] = await client<{ v: number }[]>`
    SELECT prompt_pack_generator_version AS v FROM brands WHERE id = ${brandId}`;
  return row.v;
}
async function banner(brandId: string): Promise<boolean> {
  const { serviceDb } = await import("@/db/client");
  const { loadQuestionsView } = await import("@/lib/questions/questions-view");
  const view = await loadQuestionsView(serviceDb, { brandId, organizationId: ORG });
  return view.regeneratedSuggestions === true;
}

async function patch(brandId: string, body: object) {
  const { PATCH } = await import("@/app/api/brands/[brandId]/route");
  const res = await PATCH(
    new Request(`http://localhost/api/brands/${brandId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ brandId }) },
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const RENAME = (name: string) => ({ name });
const MOVE = {
  locationMode: "fixed",
  suburb: "Lidcombe",
  city: "Sydney",
  state: "NSW",
  postcode: "2141",
  primaryRegions: ["NSW:Lidcombe"],
};

let nextAudit = 1;
async function pendingAudit(brandId: string): Promise<string> {
  const id = randomUUID();
  await client`INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status)
    VALUES (${id}, ${brandId}, ${ORG}, ${nextAudit++}, 'manual', 'pending')`;
  return id;
}
async function runInline(brandId: string): Promise<string> {
  const id = await pendingAudit(brandId);
  const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
  await runAuditInline(id);
  return id;
}
async function runInngest(brandId: string): Promise<string> {
  const id = await pendingAudit(brandId);
  const { runAudit } = await import("@/inngest/functions/run-audit");
  type Handler = (ctx: {
    event: { data: { auditId: string } };
    step: typeof step;
  }) => Promise<unknown>;
  await (runAudit as unknown as { fn: Handler }).fn({ event: { data: { auditId: id } }, step });
  return id;
}
async function auditRow(auditId: string) {
  const [row] = await client<
    { status: string; question_set_hash: string | null; question_set_id: string | null }[]
  >`SELECT status, question_set_hash, question_set_id FROM audits WHERE id = ${auditId}`;
  return row;
}
async function asked(auditId: string) {
  return client<{ prompt: string; is_branded: boolean }[]>`
    SELECT DISTINCT prompt_index, prompt, is_branded_prompt AS is_branded FROM (
      SELECT prompt_index, prompt, is_branded_prompt FROM citations WHERE audit_id = ${auditId}
      UNION ALL
      SELECT prompt_index, prompt, is_branded_prompt FROM engine_call_failures WHERE audit_id = ${auditId}
    ) x ORDER BY prompt_index`;
}

let kept: string[] = [];
beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('"event":"question_set_kept"')) kept.push(String(args[0]));
  });
  await client`INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`regen-keep-${ORG}`}, 'Regeneration Keep Org', ${`regen-keep-${ORG}`})`;
  await client`INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
                                          tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_${ORG}`}, ${`sub_${ORG}`}, 'price_test', 'agency', 'monthly', 'active')`;
  await client`INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER}, ${`regen-keep-${OWNER}`}, ${ORG}, ${`owner-${OWNER.slice(0, 8)}@regen.example.com.au`}, 'Owner', 'owner')`;
  await client`INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG}, ${OWNER}, 'owner', now(), now(), true)`;
  current.user = { id: OWNER, organizationId: ORG, role: "owner" };
}, 60_000);

afterAll(async () => {
  await deleteOrgRows(client, ORG);
  await client`DELETE FROM users WHERE id = ${OWNER}`;
  await client.end();
});

describe("a set a person applied survives a regeneration", () => {
  it("a rename keeps the version and the hash; the new questions arrive once as suggestions; the banner shows", async () => {
    const b = await makeBrand("Bilby Plumbing", { applied: true });
    const before = await currentSet(b.id);
    expect(before.version).toBe(2);
    expect(before.applied_by).toBe(OWNER);
    const asked0 = await setTexts(before.id);

    const res = await patch(b.id, RENAME("Bilby Plumbing Co"));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("questions_kept");

    const after = await currentSet(b.id);
    expect(after).toEqual(before);
    expect(await setTexts(after.id)).toEqual(asked0);
    expect(await versions(b.id)).toBe(2);
    const added = await regenerated(b.id);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((q) => q.status === "suggested" && q.source === "template")).toBe(true);
    // The new name's questions are suggestions that name the business.
    expect(
      added.filter((q) => q.text.includes("Bilby Plumbing Co")).every((q) => q.kind === "branded"),
    ).toBe(true);
    expect(added.some((q) => q.kind === "branded")).toBe(true);
    expect(await generatorVersion(b.id)).toBe(PROMPT_GENERATOR_VERSION);
    expect(await banner(b.id)).toBe(true);

    // The same save again adds nothing.
    const again = await patch(b.id, RENAME("Bilby Plumbing Co"));
    expect(again.body.status).toBeUndefined();
    expect(await regenerated(b.id)).toHaveLength(added.length);
  });

  it("after the rename the next audit asks the kept set; the old name's questions stay not counted (N4); the hash is the set's", async () => {
    const b = brandsMade[0];
    const set = await currentSet(b.id);
    const auditId = await runInline(b.id);
    const row = await auditRow(auditId);
    expect(row.status).toBe("complete");
    expect(row.question_set_id).toBe(set.id);
    expect(row.question_set_hash).toBe(set.comparison_hash);
    const q = await asked(auditId);
    expect(q.map((x) => x.prompt)).toEqual(await setTexts(set.id));
    // "Is Bilby Plumbing a good plumber ...?" names the old name, which the new one no longer matches.
    const oldName = q.filter((x) => /Bilby Plumbing(?! Co)/.test(x.prompt));
    expect(oldName.length).toBe(3);
    expect(oldName.every((x) => x.is_branded)).toBe(true);
  }, 120_000);

  it("a location change keeps the version and the hash; the moved questions arrive as suggestions", async () => {
    const b = await makeBrand("Quoll Plumbing", { applied: true });
    const before = await currentSet(b.id);
    const res = await patch(b.id, MOVE);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("questions_kept");
    expect(await currentSet(b.id)).toEqual(before);
    expect(await versions(b.id)).toBe(2);
    const added = await regenerated(b.id);
    expect(added.some((q) => q.text.includes("Lidcombe"))).toBe(true);
    expect(await banner(b.id)).toBe(true);
  });

  it("a newer generator at the audit start keeps the set in both runners; the second start adds none and doesn't regenerate", async () => {
    const b = await makeBrand("Numbat Plumbing", { applied: true, staleGenerator: true });
    const before = await currentSet(b.id);
    kept = [];
    const inline = await runInline(b.id);
    expect((await auditRow(inline)).question_set_id).toBe(before.id);
    expect((await auditRow(inline)).question_set_hash).toBe(before.comparison_hash);
    expect(await generatorVersion(b.id)).toBe(PROMPT_GENERATOR_VERSION);
    const added = await regenerated(b.id);
    expect(added.length).toBeGreaterThan(0);
    expect(kept.filter((k) => k.includes(b.id))).toHaveLength(1);
    expect(await banner(b.id)).toBe(true);

    const inngest = await runInngest(b.id);
    const row = await auditRow(inngest);
    expect(row.status).toBe("complete");
    expect(row.question_set_id).toBe(before.id);
    expect(await regenerated(b.id)).toHaveLength(added.length);
    expect(kept.filter((k) => k.includes(b.id))).toHaveLength(1);
    expect(await currentSet(b.id)).toEqual(before);
  }, 240_000);

  it("the Inngest runner keeps the set on a newer generator too", async () => {
    const b = await makeBrand("Dunnart Plumbing", { applied: true, staleGenerator: true });
    const before = await currentSet(b.id);
    const auditId = await runInngest(b.id);
    const row = await auditRow(auditId);
    expect(row.status).toBe("complete");
    expect(row.question_set_id).toBe(before.id);
    expect(await currentSet(b.id)).toEqual(before);
    expect((await regenerated(b.id)).length).toBeGreaterThan(0);
    expect(await generatorVersion(b.id)).toBe(PROMPT_GENERATOR_VERSION);
  }, 120_000);

  it("the banner goes when a new version is applied", async () => {
    const b = brandsMade[1];
    expect(await banner(b.id)).toBe(true);
    const { serviceDb } = await import("@/db/client");
    const { applyQuestionSet } = await import("@/lib/questions/apply");
    const set = await currentSet(b.id);
    const items = await client<{ question_id: string }[]>`
      SELECT question_id FROM brand_question_set_items WHERE set_id = ${set.id} ORDER BY position`;
    const r = await serviceDb.transaction((tx) =>
      applyQuestionSet(tx, {
        organizationId: ORG,
        brandId: b.id,
        userId: OWNER,
        baseVersion: set.version,
        items: items.map((i, position) => ({
          questionId: i.question_id,
          reach: "local" as const,
          position,
        })),
      }),
    );
    expect(r.ok).toBe(true);
    expect(await banner(b.id)).toBe(false);
  });
});

describe("a set nobody changed: the next version, as before (amendment 74)", () => {
  it("a rename writes the next version and the next audit asks it; no banner", async () => {
    const b = await makeBrand("Wombat Plumbing", { applied: false });
    const before = await currentSet(b.id);
    expect(before.applied_by).toBeNull();
    const res = await patch(b.id, RENAME("Wombat Plumbing Co"));
    expect(res.body.status).toBeUndefined();
    const after = await currentSet(b.id);
    expect(after.version).toBe(before.version + 1);
    const [brand] = await client<{ prompt_pack: string[] }[]>`
      SELECT prompt_pack FROM brands WHERE id = ${b.id}`;
    expect(await setTexts(after.id)).toEqual(brand.prompt_pack);
    expect(await regenerated(b.id)).toHaveLength(0);
    expect(await banner(b.id)).toBe(false);
    const auditId = await runInline(b.id);
    expect((await asked(auditId)).map((x) => x.prompt)).toEqual(brand.prompt_pack);
  }, 120_000);

  it("a location change writes the next version", async () => {
    const b = await makeBrand("Possum Plumbing", { applied: false });
    const before = await currentSet(b.id);
    await patch(b.id, MOVE);
    const after = await currentSet(b.id);
    expect(after.version).toBe(before.version + 1);
    expect((await setTexts(after.id)).some((t) => t.includes("Lidcombe"))).toBe(true);
    expect(await regenerated(b.id)).toHaveLength(0);
  });

  it("a newer generator writes the next version at the audit start, in both runners", async () => {
    for (const run of [runInline, runInngest]) {
      const b = await makeBrand(`Echidna Plumbing ${run === runInline ? "One" : "Two"}`, {
        applied: false,
        staleGenerator: true,
      });
      const before = await currentSet(b.id);
      const auditId = await run(b.id);
      const after = await currentSet(b.id);
      expect(after.version).toBe(before.version + 1);
      expect((await auditRow(auditId)).question_set_id).toBe(after.id);
      expect(await regenerated(b.id)).toHaveLength(0);
    }
  }, 240_000);
});

describe("a running audit keeps the set it started with", () => {
  it.each([
    ["inline", runInline],
    ["Inngest", runInngest],
  ] as const)(
    "%s runner: a rename while it runs writes the next version; the audit asks its own",
    async (_n, run) => {
      const b = await makeBrand(`Bandicoot Plumbing ${_n}`, { applied: false });
      const started = await currentSet(b.id);
      const startedTexts = await setTexts(started.id);
      midRun.hook = async () => {
        await patch(b.id, RENAME(`Bandicoot Plumbing ${_n} Co`));
      };
      const auditId = await run(b.id);
      expect(midRun.hook).toBeNull();
      const now = await currentSet(b.id);
      expect(now.version).toBe(started.version + 1);
      const row = await auditRow(auditId);
      expect(row.status).toBe("complete");
      expect(row.question_set_id).toBe(started.id);
      expect((await asked(auditId)).map((x) => x.prompt)).toEqual(startedTexts);
    },
    120_000,
  );
});
