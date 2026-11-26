/**
 * S02 part 3 (LLD 8.2.1; N1-N4): audits ask the brand's current question set (lib/audit/get-audit-prompts.ts), on the
 * real database with both real runners (lib/audit/run-audit-inline.ts, inngest/functions/run-audit.ts) and a stubbed
 * engine. Three invented brands shaped like the real ones the LLD names (a home-services business with a pack of 10
 * everyday questions and 4 that name it; a property-services one; a plumber with an alias):
 * - N1: the prompts before the backfill (no set: today's logic, the stored pack) and after it (the set) are the same,
 *   byte for byte, in order; both runners ask them in that order;
 * - the audit records its set (audits.question_set_id) and each answer and failure its question (question_id);
 * - N2: the audit's question_set_hash is computed as before and equals the set's comparison_hash and the pre-set
 *   audit's hash;
 * - N3: the headline Visibility (resolveAuditDimensionsAndHeadline) is the same before and after for the same answers;
 * - N4: every answer's is_branded_prompt is the same before and after; the alias question is branded either way;
 * - a regenerated pack (lib/prompts/regenerate-prompt-pack.ts: a rename) becomes the next set version and the next
 *   audit asks it; an unchanged regeneration writes no version;
 * - with no set, today's logic runs and says so (the question_set_fallback log line).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Engine } from "@/lib/llm/interface";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { sourceText } from "@/tests/helpers/source-files";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/brand-entity/wikipedia-au", async (importOriginal) =>
  (await import("@/tests/helpers/recorded-network")).recordedWikipedia(importOriginal),
);

/** The test's businesses, which every other answer names. */
const BRAND_NAMES = vi.hoisted(() => [] as string[]);

/** Each engine names the businesses in the answer to every other question; Perplexity fails the "(third)" question (the free plan asks ChatGPT and Perplexity). */
vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    getLLMService: (engine: Engine = "chatgpt") => ({
      complete: async ({ prompt }: { prompt: string }) => {
        if (engine === "perplexity" && prompt.includes("(third)"))
          throw new Error("500 Internal Server Error");
        // Every other question's answer names the businesses (whichever brand is being audited).
        const named = prompt.length % 2 === 0;
        return {
          response: named
            ? `Here are some options:\n${BRAND_NAMES.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n9. Another Local Co`
            : "Here are some options:\n1. Another Local Co\n2. Someone Else",
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
const ORG = randomUUID();

interface TestBrand {
  id: string;
  name: string;
  domain: string;
  aliases: string[];
  pack: string[];
}

const everyday = (place: string, trade: string) => [
  `Who is the best ${trade} in ${place}?`,
  `Recommend a reliable ${trade} near ${place}`,
  `Which ${trade} businesses in ${place} have good reviews?`,
  `I need a ${trade} in ${place} this week, who should I call (third)?`,
  `Affordable ${trade} services in ${place}`,
  `Trusted ${trade} for small jobs in ${place}`,
  `Where can I find a licensed ${trade} in ${place}?`,
  `Which ${trade} companies offer maintenance plans in ${place}?`,
  `Emergency ${trade} open now in ${place}`,
  `Best rated ${trade} on the ${place} side of town`,
];

const BRANDS: TestBrand[] = [
  {
    id: randomUUID(),
    name: "Wren Home Services",
    domain: "wrenhome.example.com.au",
    aliases: [],
    pack: [
      ...everyday("Chatswood", "handyman"),
      "Is Wren Home Services a good choice for a handyman in Chatswood?",
      "What are the best alternatives to Wren Home Services in Chatswood?",
      "Is Wren Home Services popular in Chatswood?",
      "Wren Home Services vs Another Local Co: which is better?",
    ],
  },
  {
    id: randomUUID(),
    name: "Yabby Services",
    domain: "yabbyservices.example.com.au",
    aliases: [],
    pack: [
      ...everyday("Castle Hill", "property maintenance company"),
      "Is Yabby Services a good choice for property maintenance in Castle Hill?",
      "What are the best alternatives to Yabby Services in Castle Hill?",
      "Is Yabby Services popular in Castle Hill?",
    ],
  },
  {
    id: randomUUID(),
    name: "Galah Plumbing",
    domain: "galahplumbing.example.com.au",
    aliases: ["Pipewren Plumbers"],
    pack: [
      ...everyday("Lidcombe", "plumber"),
      "Is Galah Plumbing a good choice for a plumber in Lidcombe?",
      "Is Pipewren Plumbers reputable?",
      "Is Galah Plumbing popular in Lidcombe?",
    ],
  },
];
BRAND_NAMES.push(...BRANDS.map((b) => b.name));

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

/** The questions an audit asked, by prompt_index, from its answers and its failures. */
async function asked(auditId: string) {
  return client<
    { prompt_index: number; prompt: string; is_branded: boolean; question_id: string | null }[]
  >`
    SELECT DISTINCT prompt_index, prompt, is_branded_prompt AS is_branded, question_id FROM (
      SELECT prompt_index, prompt, is_branded_prompt, question_id FROM citations WHERE audit_id = ${auditId}
      UNION ALL
      SELECT prompt_index, prompt, is_branded_prompt, question_id FROM engine_call_failures WHERE audit_id = ${auditId}
    ) x ORDER BY prompt_index`;
}

async function auditRow(auditId: string) {
  const [row] = await client<
    { status: string; question_set_hash: string | null; question_set_id: string | null }[]
  >`
    SELECT status, question_set_hash, question_set_id FROM audits WHERE id = ${auditId}`;
  return row;
}

async function headline(auditId: string) {
  const { serviceDb } = await import("@/db/client");
  const { resolveAuditDimensionsAndHeadline } = await import(
    "@/lib/scoring/resolve-audit-dimensions"
  );
  const r = await resolveAuditDimensionsAndHeadline(serviceDb, auditId);
  return { headline: r.headline, mentioned: r.mentionedCount, sample: r.sampleCount };
}

async function promptsNow(brandId: string) {
  const { serviceDb } = await import("@/db/client");
  const { brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { getAuditQuestions } = await import("@/lib/audit/get-audit-prompts");
  const [brand] = await serviceDb.select().from(brands).where(eq(brands.id, brandId));
  return getAuditQuestions(brand);
}

/** prod-fix 0155 run2's backfill, for this test's workspace only (as question-library-backfill does). */
async function backfill() {
  const run2 = sourceText("db/prod-fixes/0155-s02-run2-apply.sql");
  const section = run2.slice(
    run2.indexOf("-- ==== BACKFILL (begin) ===="),
    run2.indexOf("-- ==== BACKFILL (end) ===="),
  );
  const filter = "  AND NOT EXISTS (SELECT 1 FROM brand_question_sets s WHERE s.brand_id = b.id);";
  expect(section).toContain(filter);
  // Several statements, so no parameters (Postgres won't prepare them as one): ORG is this file's own UUID.
  expect(ORG).toMatch(/^[0-9a-f-]{36}$/);
  await client.begin((tx) =>
    tx.unsafe(
      section.replace(filter, filter.replace(";", `\n  AND b.organization_id = '${ORG}';`)),
    ),
  );
}

const before: Record<
  string,
  { prompts: Awaited<ReturnType<typeof promptsNow>>; inline: string; inngest: string }
> = {};

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  await client`INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`set-prompts-${ORG}`}, 'Set Prompts Org', ${`set-prompts-${ORG}`})`;
  for (const b of BRANDS) {
    await client`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, aliases, prompt_pack,
                          prompt_pack_generator_version, classification_status, classification, category_confirmed_at,
                          categories, audience, location_mode)
      VALUES (${b.id}, ${ORG}, ${b.name}, ${b.domain}, 'tradies', 'au', ARRAY[]::text[], ${b.aliases},
              ${client.json(b.pack)}, ${PROMPT_GENERATOR_VERSION}, 'complete',
              ${client.json({ category: "trades_general", buyerType: "consumer", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
              now(), ARRAY['trades_general'], 'households', 'fixed')`;
  }
  // Before S02's backfill: no set, so today's logic (the stored pack, used in full).
  for (const b of BRANDS.slice(0, 2)) {
    before[b.id] = {
      prompts: await promptsNow(b.id),
      inline: await runInline(b.id),
      inngest: await runInngest(b.id),
    };
  }
  before[BRANDS[2].id] = {
    prompts: await promptsNow(BRANDS[2].id),
    inline: await runInline(BRANDS[2].id),
    inngest: "",
  };
  await backfill();
}, 600_000);

afterAll(async () => {
  await deleteOrgRows(client, ORG);
  await client.end();
});

describe("N1: the same questions, in the same order", () => {
  it.each(
    BRANDS.map((b) => [b.name, b] as const),
  )("%s: before the backfill, today's logic; after, the set -- byte for byte", async (_n, b) => {
    const prior = before[b.id].prompts;
    expect(prior.setId).toBeNull();
    expect(prior.prompts.map((p) => p.text)).toEqual(b.pack);
    const now = await promptsNow(b.id);
    expect(now.setId).toMatch(/-/);
    expect(now.prompts.map(({ text, isBranded }) => ({ text, isBranded }))).toEqual(
      prior.prompts.map(({ text, isBranded }) => ({ text, isBranded })),
    );
    expect(now.prompts.every((p) => typeof p.questionId === "string")).toBe(true);
  });

  it("both runners ask the set's questions in its order, and record the set and each question", async () => {
    for (const b of BRANDS.slice(0, 2)) {
      const { setId, prompts } = await promptsNow(b.id);
      for (const auditId of [await runInline(b.id), await runInngest(b.id)]) {
        const row = await auditRow(auditId);
        expect(row.status).toBe("complete");
        expect(row.question_set_id).toBe(setId);
        const q = await asked(auditId);
        expect(q.map((x) => x.prompt)).toEqual(b.pack);
        expect(q.map((x) => x.question_id)).toEqual(prompts.map((p) => p.questionId));
      }
    }
  }, 300_000);

  it("a failed call records its question too (Perplexity failed the fourth question)", async () => {
    const auditId = await runInline(BRANDS[0].id);
    const [failure] = await client<{ question_id: string | null; prompt: string }[]>`
      SELECT question_id, prompt FROM engine_call_failures WHERE audit_id = ${auditId} AND engine = 'perplexity' LIMIT 1`;
    expect(failure?.prompt).toContain("(third)");
    const { prompts } = await promptsNow(BRANDS[0].id);
    expect(failure?.question_id).toBe(prompts.find((p) => p.text === failure?.prompt)?.questionId);
  }, 120_000);
});

describe("N2-N4: hash, headline and branded detection are unchanged", () => {
  it("N2: the audit's hash is the set's comparison_hash and the pre-set audit's", async () => {
    for (const b of BRANDS.slice(0, 2)) {
      const [set] = await client<{ comparison_hash: string }[]>`
        SELECT comparison_hash FROM brand_question_sets WHERE brand_id = ${b.id} AND is_current`;
      const after = await runInngest(b.id);
      const hashes = [
        (await auditRow(before[b.id].inline)).question_set_hash,
        (await auditRow(before[b.id].inngest)).question_set_hash,
        (await auditRow(after)).question_set_hash,
      ];
      expect(new Set(hashes)).toEqual(new Set([set.comparison_hash]));
    }
  }, 300_000);

  it("N3: the headline Visibility for the same answers is the same before and after", async () => {
    for (const b of BRANDS.slice(0, 2)) {
      const after = await runInline(b.id);
      expect(await headline(after)).toEqual(await headline(before[b.id].inline));
    }
  }, 300_000);

  it("N4: every answer's is_branded_prompt is the same before and after; the alias question is branded", async () => {
    const b = BRANDS[2];
    const after = await runInline(b.id);
    const strip = (rows: Awaited<ReturnType<typeof asked>>) =>
      rows.map(({ prompt, is_branded }) => ({ prompt, is_branded }));
    expect(strip(await asked(after))).toEqual(strip(await asked(before[b.id].inline)));
    expect(
      (await asked(after)).find((r) => r.prompt === "Is Pipewren Plumbers reputable?")?.is_branded,
    ).toBe(true);
  }, 120_000);
});

describe("a regenerated pack is the next set version", () => {
  it("a rename regenerates the pack; the set follows it and the next audit asks it; nothing changes writes nothing", async () => {
    const b = BRANDS[1];
    const { serviceDb } = await import("@/db/client");
    const { regeneratePromptPack } = await import("@/lib/prompts/regenerate-prompt-pack");
    await client`UPDATE brands SET name = 'Yabby Property Care' WHERE id = ${b.id}`;
    BRAND_NAMES.push("Yabby Property Care");
    await serviceDb.transaction((tx) => regeneratePromptPack(tx, b.id));
    const [brand] = await client<
      { prompt_pack: string[] }[]
    >`SELECT prompt_pack FROM brands WHERE id = ${b.id}`;
    const now = await promptsNow(b.id);
    expect(now.prompts.map((p) => p.text)).toEqual(brand.prompt_pack);
    const sets = await client<{ version: number; is_current: boolean }[]>`
      SELECT version, is_current FROM brand_question_sets WHERE brand_id = ${b.id} ORDER BY version`;
    expect(sets).toEqual([
      { version: 1, is_current: false },
      { version: 2, is_current: true },
    ]);
    // The new name is in the branded questions, typed branded by the new name.
    expect(
      now.prompts.filter((p) => p.text.includes("Yabby Property Care")).every((p) => p.isBranded),
    ).toBe(true);
    await serviceDb.transaction((tx) => regeneratePromptPack(tx, b.id));
    expect(await client`SELECT 1 FROM brand_question_sets WHERE brand_id = ${b.id}`).toHaveLength(
      2,
    );
    const auditId = await runInngest(b.id);
    expect((await asked(auditId)).map((x) => x.prompt)).toEqual(brand.prompt_pack);
  }, 300_000);
});

describe("no set: today's logic", () => {
  it("a brand with no set asks its stored pack and the fallback is logged", async () => {
    const id = randomUUID();
    await client`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack,
                          prompt_pack_generator_version, classification_status, classification, category_confirmed_at,
                          categories, audience, location_mode)
      VALUES (${id}, ${ORG}, 'Bettong Builders', 'bettong.example.com.au', 'tradies', 'au', ARRAY[]::text[],
              ${client.json(everyday("Penrith", "builder"))}, ${PROMPT_GENERATOR_VERSION}, 'complete',
              ${client.json({ category: "trades_building", buyerType: "consumer", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
              now(), ARRAY['trades_building'], 'households', 'fixed')`;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = await promptsNow(id);
    expect(r.setId).toBeNull();
    expect(r.prompts.map((p) => p.text)).toEqual(everyday("Penrith", "builder"));
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes('"event":"question_set_fallback"')),
    ).toBe(true);
    warn.mockRestore();
  });
});
