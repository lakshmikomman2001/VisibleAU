/**
 * Task #46 Phase 3, Part B -- real-DB proof that citations.response_text
 * (migration 0045) stores the FULL LLM answer and that the audit page
 * reads it: the Responses tab renders it (falling back to the snippet,
 * with an honest "not stored" note, for historical NULL rows), and the
 * Competitor card prefers it over the LLM cache -- which is never even
 * queried for a row that already has response_text.
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompleteInput } from "@/lib/llm/interface";
import { MockLLM } from "@/lib/llm/mock-impl";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const RUNNER_BRAND_ID = randomUUID();
const PAGE_BRAND_ID = randomUUID();
const RUNNER_AUDIT_ID = randomUUID();
const NEW_AUDIT_ID = randomUUID();
const HIST_AUDIT_ID = randomUUID();

const NEW_PROMPT = "who is the best emergency plumber in bondi";
const NEW_MODEL = "gpt-response-text-test";
const HIST_PROMPT = "historical plumbing prompt";
const HIST_MODEL = "gpt-response-text-hist";

// A competitor named only past character 500 of the full answer.
const LONG_HEAD = "Full Text Co is a well-regarded local plumbing business in Sydney. ".repeat(10);
const LONG_TAIL =
  "For larger commercial jobs, many locals instead call Past Five Hundred Plumbing.";
const LONG_RESPONSE = LONG_HEAD + LONG_TAIL;
const HIST_SNIPPET = "Historical answer excerpt: Full Text Co was recommended for blocked drains.";

// Appended by the MockLLM wrapper below so the runner test's responses
// are long enough that a 500-char truncation would visibly lose text.
const RUNNER_TAIL_MARKER = "RUNNER-FULL-TEXT-TAIL-MARKER";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

// Spy on (but don't replace) the real cache lookup, so the competitor
// test can prove it is NOT called for rows that have response_text.
vi.mock("@/lib/llm/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/cache")>();
  return { ...actual, getCached: vi.fn(actual.getCached) };
});

let client: ReturnType<typeof postgres>;

function llmCacheKey(prompt: string, model: string): string {
  return createHash("sha256").update(`${prompt}\n${model}`).digest("hex");
}

async function insertCitation(opts: {
  auditId: string;
  engine: string;
  prompt: string;
  llmModel: string;
  brandMentioned: boolean;
  responseSnippet: string;
  responseText: string | null;
}) {
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt,
      cited_sources, response_snippet, response_text, llm_model)
    VALUES (${opts.auditId}, ${opts.engine}, ${opts.prompt}, 1, ${opts.brandMentioned}, false,
      ${client.json([])}, ${opts.responseSnippet}, ${opts.responseText}, ${opts.llmModel})
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`crt-${ORG_ID}`}, 'CRT Test Org', ${`crt-org-${ORG_ID}`})
  `;

  // --- Runner brand: a pending audit the REAL runAuditInline() completes. ---
  // Build 1 addendum, item 9: getAuditPrompts() now blocks an
  // unconfirmed brand before it reaches the frozen-prompt_pack branch
  // -- classification_status/category_confirmed_at/location_mode must
  // look genuinely confirmed for this real runAuditInline() call to
  // reach the response_text behaviour this test actually exercises.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors, prompt_pack, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${RUNNER_BRAND_ID}, ${ORG_ID}, 'Bondi Plumbing', 'runner-text.example.com.au', 'tradies', 'au',
      ARRAY[]::text[], ARRAY[]::text[],
      ${client.json(Array.from({ length: 10 }, (_, i) => `Response text runner prompt ${i + 1}`))},
      'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
    VALUES (${RUNNER_AUDIT_ID}, ${RUNNER_BRAND_ID}, ${ORG_ID}, 1, 'manual', 'pending',
      ${client.json({ mockScenario: "happy_path" })})
  `;

  // --- Page brand: one NEW-shaped audit, one HISTORICAL-shaped audit. ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${PAGE_BRAND_ID}, ${ORG_ID}, 'Full Text Co', 'fulltext.example.com.au', 'tradies', 'au',
      ARRAY['NSW:Sydney'], ARRAY['Past Five Hundred Plumbing', 'Decoy Cache Plumbing'])
  `;
  for (const [id, n] of [
    [NEW_AUDIT_ID, 2],
    [HIST_AUDIT_ID, 3],
  ] as const) {
    await client`
      INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
        score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
      VALUES (${id}, ${PAGE_BRAND_ID}, ${ORG_ID}, ${n}, 'complete', ${["chatgpt"]}, 1, 1, now(),
        76.5, 100, 80, 75, 60, 50)
    `;
  }

  // NEW: response_text populated with a long answer. A warm cache row for
  // the same (prompt, model) holds DIFFERENT text naming a decoy
  // competitor -- if the page consulted the cache for this row, the decoy
  // would be counted.
  await insertCitation({
    auditId: NEW_AUDIT_ID,
    engine: "chatgpt",
    prompt: NEW_PROMPT,
    llmModel: NEW_MODEL,
    brandMentioned: true,
    responseSnippet: LONG_RESPONSE.slice(0, 500),
    responseText: LONG_RESPONSE,
  });
  await client`
    INSERT INTO llm_response_cache (cache_key, prompt, model, response, tokens_used, cost_estimate_usd, expires_at)
    VALUES (${llmCacheKey(NEW_PROMPT, NEW_MODEL)}, ${NEW_PROMPT}, ${NEW_MODEL},
      'Full Text Co is fine, but Decoy Cache Plumbing is cheaper.', 100, 0, now() + interval '48 hours')
  `;

  // HISTORICAL: response_text NULL, as every pre-0045 row is.
  await insertCitation({
    auditId: HIST_AUDIT_ID,
    engine: "chatgpt",
    prompt: HIST_PROMPT,
    llmModel: HIST_MODEL,
    brandMentioned: true,
    responseSnippet: HIST_SNIPPET,
    responseText: null,
  });
});

afterAll(async () => {
  const auditIds = [RUNNER_AUDIT_ID, NEW_AUDIT_ID, HIST_AUDIT_ID];
  const brandIds = [RUNNER_BRAND_ID, PAGE_BRAND_ID];
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM action_items WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ANY(${brandIds})`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client`DELETE FROM llm_response_cache WHERE cache_key = ${llmCacheKey(NEW_PROMPT, NEW_MODEL)}`;
  await client.end();
});

beforeEach(async () => {
  const cache = await import("@/lib/llm/cache");
  vi.mocked(cache.getCached).mockClear();
});

async function renderAuditPage(auditId: string, tab?: "responses"): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  const element = await AuditPage({
    params: Promise.resolve({ auditId }),
    searchParams: Promise.resolve(tab ? { tab } : {}),
  });
  return renderToStaticMarkup(element);
}

describe("audit runner writes the full answer to citations.response_text", () => {
  it("every citation row's response_text is the full, untruncated LLM response; response_snippet stays its first 500 chars", async () => {
    const original = MockLLM.prototype.complete;
    const spy = vi.spyOn(MockLLM.prototype, "complete").mockImplementation(async function (
      this: MockLLM,
      input: CompleteInput,
    ) {
      const out = await original.call(this, input);
      if (input.task !== "brand_mention") return out;
      return { ...out, response: `${out.response} ${"padding ".repeat(80)}${RUNNER_TAIL_MARKER}` };
    });
    try {
      const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
      await runAuditInline(RUNNER_AUDIT_ID);
    } finally {
      spy.mockRestore();
    }

    const [audit] = await client`SELECT status FROM audits WHERE id = ${RUNNER_AUDIT_ID}`;
    expect(audit.status).toBe("complete");
    const rows = await client<{ response_text: string | null; response_snippet: string | null }[]>`
      SELECT response_text, response_snippet FROM citations WHERE audit_id = ${RUNNER_AUDIT_ID}
    `;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.response_text).not.toBeNull();
      expect(row.response_text?.length ?? 0).toBeGreaterThan(500);
      expect(row.response_text?.endsWith(RUNNER_TAIL_MARKER)).toBe(true);
      expect(row.response_snippet).toBe(row.response_text?.slice(0, 500));
      expect(row.response_snippet).not.toContain(RUNNER_TAIL_MARKER);
    }
  });
});

describe("Responses tab -- full answer vs historical snippet", () => {
  it("renders the FULL response_text (text past char 500 included) with a Show full answer toggle, no 'not stored' note", async () => {
    const html = await renderAuditPage(NEW_AUDIT_ID, "responses");
    expect(html).toContain(LONG_TAIL);
    expect(html).toContain('data-answer-kind="full"');
    expect(html).toContain("Show full answer");
    expect(html).not.toContain("full answer not stored");
  });

  it("a historical row (response_text IS NULL) shows the snippet plus the 'not stored' note, never claiming a full answer", async () => {
    const html = await renderAuditPage(HIST_AUDIT_ID, "responses");
    expect(html).toContain(HIST_SNIPPET);
    expect(html).toContain('data-answer-kind="snippet"');
    expect(html).toContain("full answer not stored for audits");
    expect(html).not.toContain('data-answer-kind="full"');
    expect(html).not.toContain("Show full answer");
  });
});

describe("Competitor card -- response_text first, cache only for historical rows", () => {
  it("counts a competitor named only past char 500 of response_text, ignores the decoy in the warm cache, and never queries the cache for that row", async () => {
    const html = await renderAuditPage(NEW_AUDIT_ID);
    const count = (name: string) =>
      html.match(new RegExp(`>${name}</span></div><span[^>]*>(\\d+)</span>`))?.[1];
    expect(count("Past Five Hundred Plumbing")).toBe("1");
    expect(count("Decoy Cache Plumbing")).toBe("0");

    const cache = await import("@/lib/llm/cache");
    const promptsQueried = vi.mocked(cache.getCached).mock.calls.map((c) => c[0]);
    expect(promptsQueried).not.toContain(NEW_PROMPT);
  });

  it("a historical row (no response_text) still falls back to the cache lookup", async () => {
    await renderAuditPage(HIST_AUDIT_ID);
    const cache = await import("@/lib/llm/cache");
    const promptsQueried = vi.mocked(cache.getCached).mock.calls.map((c) => c[0]);
    expect(promptsQueried).toContain(HIST_PROMPT);
  });
});
