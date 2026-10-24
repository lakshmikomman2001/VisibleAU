/**
 * Audit #36 (25 Oct) -- real DB, real page.
 *
 * Item 1: every "of n" on the finished page -- headline, its CI, the
 * per-engine rows, the Responses tab, the directory panel -- is the
 * count of successful everyday answers. A failed everyday call drops n
 * by one everywhere (39); a failed about-the-business call drops it
 * nowhere (40), because those answers never count.
 *
 * Items 2-3: Position, Source citation and the per-engine rows show the
 * counts behind them ("#4", "3 of 3", "0 of 9 · 0%"), never a 0-100
 * score or its interval.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
/** Shaped like production Audit #36: Claude's about-the-business question 12 failed. */
const BRANDED_FAILURE_AUDIT = randomUUID();
/** Same pack, but Claude's everyday question 3 failed instead. */
const EVERYDAY_FAILURE_AUDIT = randomUUID();

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"] as const;
const EVERYDAY = Array.from(
  { length: 10 },
  (_, i) => `Who is a reliable plumber near Bondi? (${i})`,
);
const BRANDED = [
  "Is Omega Services a good choice for plumbing in Bondi?",
  "Omega Services vs Delta Plumbing — which is better in Bondi?",
  "What are the best alternatives to Omega Services in Bondi?",
];

// Omega Services sits at #4 of a numbered list, with a hipages source.
const RANKED_MENTION =
  "Good local options:\n1. Alpha Plumbing\n2. Beta Plumbing\n3. Gamma Plumbing\n4. Omega Services, a Bondi plumber with fast call-outs.\n5. Delta Plumbing";
const NO_MENTION = "Good local options: Alpha Plumbing, Beta Plumbing and Gamma Plumbing.";
const HIPAGES = [{ url: "https://hipages.com.au/connect/omegaservices", domain: "hipages.com.au" }];

let client: ReturnType<typeof postgres>;

async function seedAudit(
  auditId: string,
  auditNumber: number,
  opts: {
    failed: { engine: string; index: number };
    mentions: Array<{ engine: string; index: number }>;
  },
) {
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at)
    VALUES (${auditId}, ${BRAND_ID}, ${ORG_ID}, ${auditNumber}, 'manual', 'complete', ${[...ENGINES]}, 4, 13, 1, 52, now() - interval '9 minutes', now())
  `;
  const prompts = [...EVERYDAY, ...BRANDED];
  for (const engine of ENGINES) {
    for (const [index, prompt] of prompts.entries()) {
      const isBranded = index >= EVERYDAY.length;
      if (opts.failed.engine === engine && opts.failed.index === index) {
        await client`
          INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts, latency_ms, cost_usd)
          VALUES (${auditId}, ${ORG_ID}, ${engine}, ${prompt}, ${index}, ${isBranded}, 'other', 'Bad request', 1, 1100, '0')
        `;
        continue;
      }
      const mentioned =
        isBranded || opts.mentions.some((m) => m.engine === engine && m.index === index);
      const text = mentioned ? RANKED_MENTION : NO_MENTION;
      // Every everyday answer that mentions the brand cites hipages, and so does question 9 on every engine.
      const sources = !isBranded && (mentioned || index === 9) ? HIPAGES : [];
      await client`
        INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt, mention_verification, sentiment_label, context_label, response_text, response_snippet, cited_sources, llm_model, llm_cost_usd)
        VALUES (${auditId}, ${engine}, ${prompt}, ${index}, 1, ${mentioned}, ${isBranded},
          ${mentioned ? "verified_location" : null}, ${mentioned ? "positive" : "neutral"}, ${mentioned ? "listed" : "absent"},
          ${text}, ${text.slice(0, 500)}, ${client.json(sources)}, 'test-model', '0.010000')
      `;
    }
  }
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`audit36-${ORG_ID}`}, 'Audit 36 Test Org', ${`audit36-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Omega Services', 'omegaservices.example.com.au', 'tradies', 'au',
      ARRAY[]::text[],
      ${client.json([...EVERYDAY, ...BRANDED])},
      ${PROMPT_GENERATOR_VERSION},
      'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')
  `;
  // Audit #36: 3 mentions, one each from ChatGPT, Gemini and Perplexity.
  await seedAudit(BRANDED_FAILURE_AUDIT, 36, {
    failed: { engine: "claude", index: 12 },
    mentions: [
      { engine: "chatgpt", index: 0 },
      { engine: "gemini", index: 1 },
      { engine: "perplexity", index: 2 },
    ],
  });
  // 5 mentions, so the small-sample note is hidden.
  await seedAudit(EVERYDAY_FAILURE_AUDIT, 37, {
    failed: { engine: "claude", index: 3 },
    mentions: [
      { engine: "chatgpt", index: 0 },
      { engine: "chatgpt", index: 1 },
      { engine: "gemini", index: 0 },
      { engine: "gemini", index: 1 },
      { engine: "perplexity", index: 0 },
    ],
  });
}, 60000);

afterAll(async () => {
  await client`DELETE FROM engine_call_failures WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM citations WHERE audit_id IN (${BRANDED_FAILURE_AUDIT}, ${EVERYDAY_FAILURE_AUDIT})`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function renderAuditPage(auditId: string, tab?: "responses"): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  const element = await AuditPage({
    params: Promise.resolve({ auditId }),
    searchParams: Promise.resolve(tab ? { tab } : {}),
  });
  // React separates adjacent text nodes with <!-- -->; drop them so a sentence reads as one string.
  return renderToStaticMarkup(element).replace(/<!-- -->/g, "");
}

/** Every per-engine row on the page: "<Engine></span><span …>k of n · r%</span>". */
function engineRows(html: string) {
  const rows = [
    ...html.matchAll(
      />(ChatGPT|Claude|Gemini|Perplexity)<\/span><span[^>]*>(\d+) of (\d+) · (\d+)%<\/span>/g,
    ),
  ];
  return rows.map(([, engine, k, n, rate]) => ({
    engine,
    k: Number(k),
    n: Number(n),
    rate: Number(rate),
  }));
}

async function withTx<T>(fn: (tx: import("@/db/client").DbClient) => Promise<T>): Promise<T> {
  const { withRlsContext } = await import("@/db/client");
  return withRlsContext(ORG_ID, (tx) => fn(tx));
}

describe("item 1 -- one everyday-answer count behind every 'of n'", () => {
  it("1 everyday failure: n = 39 in the resolver, per engine, the CI and the directory panel", async () => {
    const { resolveAuditDimensionsAndHeadline } = await import(
      "@/lib/scoring/resolve-audit-dimensions"
    );
    const { getDirectoryCitationsForAudit } = await import("@/lib/directories/citation-counts");
    const { wilsonCI } = await import("@/lib/scoring/wilson");
    const { resolved, directories } = await withTx(async (tx) => {
      const [brand] = await client`SELECT * FROM brands WHERE id = ${BRAND_ID}`;
      return {
        resolved: await resolveAuditDimensionsAndHeadline(tx, EVERYDAY_FAILURE_AUDIT),
        directories: await getDirectoryCitationsForAudit(tx, EVERYDAY_FAILURE_AUDIT, {
          id: BRAND_ID,
          region: brand.region,
          categories: brand.categories,
        }),
      };
    });

    expect(resolved.sampleCount).toBe(39);
    expect(resolved.mentionedCount).toBe(5);
    expect(resolved.perEngine).toEqual([
      { engine: "chatgpt", sampleCount: 10, mentionedCount: 2 },
      { engine: "claude", sampleCount: 9, mentionedCount: 0 },
      { engine: "gemini", sampleCount: 10, mentionedCount: 2 },
      { engine: "perplexity", sampleCount: 10, mentionedCount: 1 },
    ]);
    expect(resolved.headline.status === "scored" && resolved.headline.ci).toEqual(wilsonCI(5, 39));
    expect(directories.totalAnswers).toBe(39);
  });

  it("1 everyday failure: the page says 'of 39' in the headline, per engine, the directory panel and the Responses tab", async () => {
    const html = await renderAuditPage(EVERYDAY_FAILURE_AUDIT);
    const { wilsonCI } = await import("@/lib/scoring/wilson");
    const ci = wilsonCI(5, 39);
    expect(html).toContain(
      `Mentioned in 5 of 39 answers · 95% CI ${ci.lower.toFixed(0)}–${ci.upper.toFixed(0)}%`,
    );
    expect(html).toContain("Out of 39 answers to everyday customer questions");
    expect(html).toContain("hipages cited in 9 of 39 answers");

    const rows = engineRows(html);
    expect(rows.map((r) => r.engine)).toEqual(["ChatGPT", "Claude", "Gemini", "Perplexity"]);
    expect(rows.find((r) => r.engine === "Claude")).toEqual({
      engine: "Claude",
      k: 0,
      n: 9,
      rate: 0,
    });
    expect(rows.reduce((s, r) => s + r.k, 0)).toBe(5);
    expect(rows.reduce((s, r) => s + r.n, 0)).toBe(39);
    expect(html).toContain("1 failed — not counted");
    // 5 mentions back each card: no small-sample note.
    expect(html).not.toContain("small sample");

    const responses = await renderAuditPage(EVERYDAY_FAILURE_AUDIT, "responses");
    expect(responses).toMatch(/>5<\/strong> of 39 answers to everyday customer questions/);
  });

  it("1 about-the-business failure (production Audit #36): n stays 40 everywhere", async () => {
    const html = await renderAuditPage(BRANDED_FAILURE_AUDIT);
    expect(html).toContain("Mentioned in 3 of 40 answers · 95% CI 3–20%");
    expect(html).toContain("Out of 40 answers to everyday customer questions");
    expect(html).toContain("hipages cited in 7 of 40 answers");

    const rows = engineRows(html);
    expect(rows).toEqual([
      { engine: "ChatGPT", k: 1, n: 10, rate: 10 },
      { engine: "Claude", k: 0, n: 10, rate: 0 },
      { engine: "Gemini", k: 1, n: 10, rate: 10 },
      { engine: "Perplexity", k: 1, n: 10, rate: 10 },
    ]);
    expect(html).toContain("1 failed — not counted");

    const responses = await renderAuditPage(BRANDED_FAILURE_AUDIT, "responses");
    expect(responses).toMatch(/>3<\/strong> of 40 answers to everyday customer questions/);
  });
});

describe("items 2-3 -- measured values on the Position, Source and per-engine cards", () => {
  it("Audit #36: Position '#4' and Source '3 of 3', with no 94.0 / 100.0 / 44 and no per-engine 10.0 / 0.0", async () => {
    const html = await renderAuditPage(BRANDED_FAILURE_AUDIT);
    expect(html).toMatch(/>#4<\/div><p[^>]*>3 of 3 mentions were in a ranked list<\/p>/);
    expect(html).toMatch(/>3 of 3<\/div><p[^>]*>mentions linked a source<\/p>/);
    expect(html.match(/Based on 3 mentions — small sample/g)?.length).toBe(2);

    expect(html).not.toContain("94.0");
    expect(html).not.toContain("100.0");
    expect(html).not.toMatch(/>44</);
    expect(html).not.toContain("Typically #");
    expect(html).not.toMatch(/>10\.0</);
    expect(html).not.toMatch(/>0\.0</);
    expect(html).not.toContain("mention rate</span>");
  });

  it("the Claude row: the right n, and the failure note on its own line, outside the counts", async () => {
    const html = await renderAuditPage(BRANDED_FAILURE_AUDIT);
    expect(html).toMatch(
      />Claude<\/span><span[^>]*white-space:nowrap[^>]*>0 of 10 · 0%<\/span><\/div><div[^>]*><div[^>]*><\/div><\/div><p[^>]*>1 failed — not counted<\/p>/,
    );
    // The reason is still there, on hover.
    expect(html).toContain('title="1 failed: 1 error"');
  });
});
