/**
 * S04 part 0e (LLD amendments 88, 94; contract v1.9 P07.split): the split under the headline, on the real database
 * and the real audit page.
 * - Its two parts add up to the headline's answers and mentions with "count in headline" off (Google's answers are in
 *   neither, even when collected) and on (each everyday question where Google showed an AI answer joins the part its
 *   question belongs to, a mention only when verified -- exactly as the headline counts it).
 * - Each source on its own line under the headline, right-aligned: a long agency name stays whole inside its part.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */

import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BRANDED_QUESTIONS,
  EVERYDAY_QUESTIONS,
  type FixtureAuditSpec,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session } = vi.hoisted(() => ({ session: { organizationId: "" } }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ organizationId: session.organizationId })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

const AGENCY = "Possum Marketing and Digital Growth Partners of Greater Western Sydney";
/** Everyday questions 1-7 from templates and AI suggestions; 8-10 the agency's. */
const SOURCES = (i: number) => (i >= 7 ? "agency" : i < 3 ? "original" : "template");
const AUDIT_51: FixtureAuditSpec = {
  number: 51,
  completedAt: "2026-11-25T02:00:00.000Z",
  mentions: { chatgpt: [1, 2, 8], claude: [1, 3], gemini: [2], perplexity: [9] },
};

let sql: ReturnType<typeof postgres>;
let fx: ReportFixture;

async function recordSet() {
  const auditId = fx.audits[51];
  const [set] = await sql<{ id: string }[]>`
    INSERT INTO brand_question_sets (organization_id, brand_id, version, is_current, comparison_hash, applied_at)
    VALUES (${fx.orgId}, ${fx.brandId}, 1, true, 's04-split', now()) RETURNING id`;
  const rows = [
    ...EVERYDAY_QUESTIONS.map((text, i) => ({ text, kind: "everyday", source: SOURCES(i) })),
    ...BRANDED_QUESTIONS.map((text) => ({ text, kind: "branded", source: "original" })),
  ];
  for (const [position, r] of rows.entries()) {
    const [q] = await sql<{ id: string }[]>`
      INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
      VALUES (${fx.orgId}, ${fx.brandId}, ${r.text}, question_text_key(${r.text}), ${r.kind}, ${r.source}) RETURNING id`;
    await sql`INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
      VALUES (${set.id}, ${fx.orgId}, ${q.id}, ${position}, ${r.kind}, 'local', ${r.source})`;
  }
  await sql`UPDATE audits SET question_set_id = ${set.id} WHERE id = ${auditId}`;
}

/** Google collected for the audit; `count` is the stored "count in headline". */
async function google(count: boolean) {
  const auditId = fx.audits[51];
  await sql`DELETE FROM google_surface_results WHERE audit_id = ${auditId}`;
  await sql`DELETE FROM audit_google_surfaces WHERE audit_id = ${auditId}`;
  await sql`
    INSERT INTO audit_google_surfaces (audit_id, organization_id, surfaces, settings, location, status, cost_usd, completed_at)
    VALUES (${auditId}, ${fx.orgId}, ARRAY['google_ai_overviews', 'google_ai_mode']::text[],
      ${sql.json({ aiOverviewsEnabled: true, aiModeEnabled: true, countInHeadline: count, queueMode: "standard", device: "desktop", maxCostUsdPerAudit: 0.1, provider: "dataforseo", decisions: {} })},
      ${sql.json({ code: 9071744, label: "2153 NSW", kind: "postcode", precise: true, note: null })},
      'complete', 0.0096, now())`;
  // AI Overviews: shown for questions 1 (verified), 4, 8 (verified), 9 (named but unverified); not shown for 2.
  // AI Mode: shown for 3 (verified by location) and 10; a question that names the business is never counted.
  const rows: Array<[string, number, string, boolean | null, string | null]> = [
    ["google_ai_overviews", 0, "shown", true, "verified_domain"],
    ["google_ai_overviews", 1, "not_shown", null, null],
    ["google_ai_overviews", 3, "shown", false, null],
    ["google_ai_overviews", 7, "shown", true, "verified_domain"],
    ["google_ai_overviews", 8, "shown", true, "unverified"],
    ["google_ai_mode", 2, "shown", true, "verified_location"],
    ["google_ai_mode", 9, "shown", false, null],
  ];
  for (const [surface, i, outcome, mentioned, verification] of rows) {
    await sql`
      INSERT INTO google_surface_results (audit_id, organization_id, surface, prompt, prompt_index,
        is_branded_prompt, outcome, provider, attempts, answer_text, cited_links, google_link_count,
        brand_mentioned, mention_verification, cost_usd, cost_source, location_code, location_label,
        device, se_domain, language_code, queue_mode, fetched_at)
      VALUES (${auditId}, ${fx.orgId}, ${surface}, ${EVERYDAY_QUESTIONS[i]}, ${i}, false, ${outcome}, 'dataforseo', 1,
        ${outcome === "shown" ? "An AI answer." : null}, ${sql.json([])}, 0, ${mentioned}, ${verification}, 0.0048,
        'provider_reported', 9071744, '2153 NSW', 'desktop', 'google.com.au', 'en', 'standard', now())`;
  }
  await sql`
    INSERT INTO google_surface_results (audit_id, organization_id, surface, prompt, prompt_index,
      is_branded_prompt, outcome, provider, attempts, answer_text, cited_links, google_link_count,
      brand_mentioned, mention_verification, cost_usd, cost_source, location_code, location_label,
      device, se_domain, language_code, queue_mode, fetched_at)
    VALUES (${auditId}, ${fx.orgId}, 'google_ai_mode', ${BRANDED_QUESTIONS[0]}, 10, true, 'shown', 'dataforseo', 1,
      'An AI answer.', ${sql.json([])}, 0, true, 'verified_domain', 0.0048, 'provider_reported', 9071744,
      '2153 NSW', 'desktop', 'google.com.au', 'en', 'standard', now())`;
}

async function sums() {
  const { serviceDb } = await import("@/db/client");
  const { loadAuditQuestionMix } = await import("@/lib/questions/mix");
  const { resolveAuditDimensionsAndHeadline } = await import(
    "@/lib/scoring/resolve-audit-dimensions"
  );
  const mix = await loadAuditQuestionMix(serviceDb, {
    organizationId: fx.orgId,
    auditId: fx.audits[51],
  });
  const headline = await resolveAuditDimensionsAndHeadline(serviceDb, fx.audits[51]);
  const split = mix?.split;
  return {
    split,
    parts: split ? { n: split.ai.n + split.agency.n, m: split.ai.m + split.agency.m } : null,
    headline: {
      n: headline.sampleCount,
      m: headline.mentionedCount,
      google: headline.googleIncluded === true,
    },
  };
}

const clean = (html: string) => html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");
const testId = (html: string, id: string) =>
  html.match(new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`))?.[1] ?? null;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  fx = await seedReportFixture(sql, { audits: [AUDIT_51], agencyName: AGENCY });
  await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${fx.orgId}, 'agency_questions', true)`;
  await recordSet();
}, 180_000);

afterAll(async () => {
  if (fx) {
    await sql`DELETE FROM google_surface_results WHERE organization_id = ${fx.orgId}`;
    await sql`DELETE FROM audit_google_surfaces WHERE organization_id = ${fx.orgId}`;
    await sql`UPDATE audits SET question_set_id = NULL WHERE organization_id = ${fx.orgId}`;
    await sql`DELETE FROM brand_question_set_items WHERE organization_id = ${fx.orgId}`;
    await sql`DELETE FROM brand_question_sets WHERE organization_id = ${fx.orgId}`;
    await sql`DELETE FROM brand_questions WHERE organization_id = ${fx.orgId}`;
    await sql`DELETE FROM org_feature_flags WHERE organization_id = ${fx.orgId}`;
    await fx.cleanup();
  }
  await sql.end();
});

describe("the split adds up to the headline", () => {
  it("without Google in the headline (none collected)", async () => {
    const r = await sums();
    expect(r.headline.google).toBe(false);
    expect(r.parts).toEqual({ n: r.headline.n, m: r.headline.m });
    expect(r.parts).toEqual({ n: 40, m: 7 });
  });

  it("Google collected but not counted in the headline: in neither", async () => {
    await google(false);
    const r = await sums();
    expect(r.headline.google).toBe(false);
    expect(r.parts).toEqual({ n: r.headline.n, m: r.headline.m });
    expect(r.parts).toEqual({ n: 40, m: 7 });
  });

  it("Google counted in the headline: split too, each answer in its question's part", async () => {
    await google(true);
    const r = await sums();
    expect(r.headline.google).toBe(true);
    // Shown and not naming the business: 6 more answers (questions 1, 3, 4, 8, 9, 10); verified mentions: 1, 3, 8.
    expect(r.headline).toMatchObject({ n: 46, m: 10 });
    expect(r.parts).toEqual({ n: r.headline.n, m: r.headline.m });
    // AI-suggested (questions 1-7): 28 + 3 Google answers, mentioned 5 + 2; the agency's (8-10): 12 + 3, 2 + 1.
    expect(r.split).toEqual({ ai: { n: 31, m: 7 }, agency: { n: 15, m: 3 } });
  });
});

describe("the audit page", () => {
  it("each source on its own line, the long agency name whole inside its part", async () => {
    session.organizationId = fx.orgId;
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const html = clean(
      renderToStaticMarkup(
        await AuditPage({
          params: Promise.resolve({ auditId: fx.audits[51] }),
          searchParams: Promise.resolve({}),
        }),
      ),
    );
    expect(html).toContain("Mentioned in 10 of 46 answers");
    expect(testId(html, "p07-split-ai")).toBe("AI-suggested questions: 23% (7 of 31)");
    expect(testId(html, "p07-split-agency")).toBe(`Written by ${AGENCY}: 20% (3 of 15)`);
    expect(html).toMatch(/data-testid="p07-split-agency" class="min-\[641px\]:whitespace-nowrap"/);
  }, 120_000);
});
