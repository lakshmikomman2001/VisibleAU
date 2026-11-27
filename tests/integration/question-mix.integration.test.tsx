/**
 * S03 part 6 (LLD 8.3.3, decision D2; contract P07.mix, P07.split, P09.method): what an audit asked, by who wrote it.
 * - A fixture with 7 AI-suggested, template and original everyday questions and 3 the agency wrote (plus 3 branded):
 *   the audit page's mix line "13 questions: 10 everyday (7 AI-suggested, 3 written by Possum Marketing) and 3 that
 *   name the business.", the split line under the headline (each kind over its own answers, counted as the headline
 *   counts them -- an 'unverified' mention isn't one), and the headline itself unchanged over all everyday answers.
 * - The seeded fixtures standing in for Hero and Omega (the report fixture's Yabby Services, the report seeds) never
 *   recorded a question set: only the mix line, "(all from the original set)", on the audit page, the client portal and
 *   the report's Method page; no split line.
 * - The report prints the line from its stored snapshot (v2.questionMix.detail), without the split; page counts are
 *   unchanged by it. agency_questions off: none of it (the page as after S02, the S01 line on the report).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AUDIT_38,
  BRANDED_QUESTIONS,
  EVERYDAY_QUESTIONS,
  type FixtureAuditSpec,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { IRONSTONE, type SeededReportBrand, seedReportBrand } from "@/tests/helpers/report-seeds";
import { type RenderedReport, renderSeededReport } from "@/tests/helpers/seeded-report-render";
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

/** Everyday questions 1-7 from the original set, templates and AI suggestions; 8-10 the agency's. */
const SOURCES = [
  "original",
  "original",
  "original",
  "template",
  "template",
  "ai_suggested",
  "ai_suggested",
  "agency",
  "agency",
  "agency",
];
const AUDIT_50: FixtureAuditSpec = {
  number: 50,
  completedAt: "2026-11-24T02:00:00.000Z",
  mentions: { chatgpt: [1, 2, 8], claude: [1, 3], gemini: [2], perplexity: [9] },
};
const MIXED_TOKEN = "s03-mix-mixed-token";
const PLAIN_TOKEN = "s03-mix-plain-token";

let sql: ReturnType<typeof postgres>;
let mixed: ReportFixture;
let plain: ReportFixture;

const flag = async (orgId: string, on: boolean) => {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${orgId} AND flag_key = 'agency_questions'`;
  if (on)
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${orgId}, 'agency_questions', true)`;
};
const clean = (html: string) => html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");
const testId = (html: string, id: string) =>
  html.match(new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`))?.[1] ?? null;

async function auditPage(fx: ReportFixture, auditNumber: number): Promise<string> {
  session.organizationId = fx.orgId;
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  return clean(
    renderToStaticMarkup(
      await AuditPage({
        params: Promise.resolve({ auditId: fx.audits[auditNumber] }),
        searchParams: Promise.resolve({}),
      }),
    ),
  );
}
async function portal(token: string): Promise<string> {
  const Page = (await import("@/app/client-portal/[inviteToken]/page")).default;
  return clean(
    renderToStaticMarkup(await Page({ params: Promise.resolve({ inviteToken: token }) })),
  );
}

/** A current question set on the brand, the given audit recording it; `source(i)` for everyday question i. */
async function recordSet(
  orgId: string,
  brandId: string,
  auditId: string,
  everyday: readonly string[],
  branded: readonly string[],
  source: (i: number) => string,
) {
  const [set] = await sql<{ id: string }[]>`
    INSERT INTO brand_question_sets (organization_id, brand_id, version, is_current, comparison_hash, applied_at)
    VALUES (${orgId}, ${brandId}, 1, true, 's03-mix', now()) RETURNING id`;
  const rows = [
    ...everyday.map((text, i) => ({ text, kind: "everyday", source: source(i) })),
    ...branded.map((text) => ({ text, kind: "branded", source: "original" })),
  ];
  for (const [position, r] of rows.entries()) {
    const [q] = await sql<{ id: string }[]>`
      INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source)
      VALUES (${orgId}, ${brandId}, ${r.text}, question_text_key(${r.text}), ${r.kind}, ${r.source}) RETURNING id`;
    await sql`INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
      VALUES (${set.id}, ${orgId}, ${q.id}, ${position}, ${r.kind}, 'local', ${r.source})`;
    // The agency's answers carry the question's id (as an audit since S02 writes them); the rest match by text.
    if (r.source === "agency")
      await sql`UPDATE citations SET question_id = ${q.id} WHERE audit_id = ${auditId} AND prompt = ${r.text}`;
  }
  await sql`UPDATE audits SET question_set_id = ${set.id} WHERE id = ${auditId}`;
}
async function dropSets(orgId: string) {
  await sql`UPDATE audits SET question_set_id = NULL WHERE organization_id = ${orgId}`;
  await sql`UPDATE citations SET question_id = NULL WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ${orgId})`;
  await sql`DELETE FROM brand_question_set_items WHERE organization_id = ${orgId}`;
  await sql`DELETE FROM brand_question_sets WHERE organization_id = ${orgId}`;
  await sql`DELETE FROM brand_questions WHERE organization_id = ${orgId}`;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  mixed = await seedReportFixture(sql, { audits: [AUDIT_50], agencyName: "Possum Marketing" });
  plain = await seedReportFixture(sql, { audits: [AUDIT_38] });
  await recordSet(
    mixed.orgId,
    mixed.brandId,
    mixed.audits[50],
    EVERYDAY_QUESTIONS,
    BRANDED_QUESTIONS,
    (i) => SOURCES[i],
  );
  // Gemini's mention on question 2 named another business with the same name: real text, not counted.
  await sql`UPDATE citations SET mention_verification = 'unverified'
    WHERE audit_id = ${mixed.audits[50]} AND engine = 'gemini' AND prompt = ${EVERYDAY_QUESTIONS[1]} AND brand_mentioned`;
  for (const [fx, token] of [
    [mixed, MIXED_TOKEN],
    [plain, PLAIN_TOKEN],
  ] as const) {
    await sql`INSERT INTO client_portal_invites (organization_id, brand_id, invite_token)
      VALUES (${fx.orgId}, ${fx.brandId}, ${token})`;
  }
}, 180_000);

afterAll(async () => {
  for (const fx of [mixed, plain]) {
    if (!fx) continue;
    await dropSets(fx.orgId);
    await sql`DELETE FROM client_portal_invites WHERE organization_id = ${fx.orgId}`;
    await sql`DELETE FROM org_feature_flags WHERE organization_id = ${fx.orgId}`;
    await fx.cleanup();
  }
  await sql.end();
});

describe("the audit page (P07.mix, P07.split)", () => {
  it("agency_questions off: neither line; the headline as before", async () => {
    await flag(mixed.orgId, false);
    const html = await auditPage(mixed, 50);
    expect(html).not.toContain('data-testid="p07-mix"');
    expect(html).not.toContain('data-testid="p07-split"');
    expect(html).toContain("Mentioned in 6 of 40 answers");
  }, 120_000);

  it("7 AI-suggested and 3 written by the agency: the mix line, the split under the headline, the headline unchanged", async () => {
    await flag(mixed.orgId, true);
    const html = await auditPage(mixed, 50);
    expect(testId(html, "p07-mix")).toBe(
      "13 questions: 10 everyday (7 AI-suggested, 3 written by Possum Marketing) and 3 that name the business.",
    );
    // AI-suggested: 7 questions x 4 engines = 28 answers, mentioned in 4 (Gemini's unverified one isn't counted);
    // the agency's: 12 answers, mentioned in 2. Together the headline's 6 of 40.
    // S04 part 0e (LLD amendment 94): "The split prints each source on its own line under the headline".
    expect(testId(html, "p07-split-ai")).toBe("AI-suggested questions: 14% (4 of 28)");
    expect(testId(html, "p07-split-agency")).toBe("Written by Possum Marketing: 17% (2 of 12)");
    expect(html).toContain("Mentioned in 6 of 40 answers");
  }, 120_000);

  it("the fixture standing in for Omega (no question set recorded): only the mix line, all from the original set", async () => {
    await flag(plain.orgId, true);
    const html = await auditPage(plain, 38);
    expect(testId(html, "p07-mix")).toBe(
      "13 questions: 10 everyday (all from the original set) and 3 that name the business.",
    );
    expect(html).not.toContain('data-testid="p07-split"');
  }, 120_000);
});

describe("the client portal (P07.mix)", () => {
  it("the mix line under the headline while agency_questions is on; never the split", async () => {
    await flag(plain.orgId, true);
    expect(testId(await portal(PLAIN_TOKEN), "portal-question-mix")).toBe(
      "13 questions: 10 everyday (all from the original set) and 3 that name the business.",
    );
    await flag(mixed.orgId, true);
    const html = await portal(MIXED_TOKEN);
    expect(testId(html, "portal-question-mix")).toBe(
      "13 questions: 10 everyday (7 AI-suggested, 3 written by Possum Marketing) and 3 that name the business.",
    );
    expect(html).not.toContain("AI-suggested questions:");
    await flag(plain.orgId, false);
    expect(await portal(PLAIN_TOKEN)).not.toContain('data-testid="portal-question-mix"');
  }, 120_000);
});

describe("the report's Method page (P09.method), from the snapshot", () => {
  let seed: SeededReportBrand;
  const off: Partial<Record<"basic" | "enhanced", RenderedReport>> = {};
  const line = (r: RenderedReport) => {
    const t = r.pages.flat();
    return t[t.indexOf("Questions asked") + 1];
  };

  beforeAll(async () => {
    seed = await seedReportBrand(sql, IRONSTONE);
    off.basic = await renderSeededReport(sql, seed, "basic");
    off.enhanced = await renderSeededReport(sql, seed, "enhanced");
  }, 300_000);
  afterAll(async () => {
    if (!seed) return;
    await dropSets(seed.orgId);
    await sql`DELETE FROM org_feature_flags WHERE organization_id = ${seed.orgId} AND flag_key = 'agency_questions'`;
    await seed.cleanup();
  });

  it("off: the S01 line, as before", () => {
    const { everyday: e, branded: b } = off.basic!.data.questions;
    expect(line(off.basic!)).toBe(
      `${e + b} questions: ${e} everyday (${e} AI-suggested) and ${b} that name the business.`,
    );
    expect(off.enhanced!.data.v2?.questionMix.detail).toBeUndefined();
  });

  it("on, the seeded brand standing in for Hero: all from the original set, stored in the snapshot, same pages", async () => {
    await flag(seed.orgId, true);
    for (const tier of ["basic", "enhanced"] as const) {
      const r = await renderSeededReport(sql, seed, tier);
      const { everyday: e, branded: b } = r.data.questions;
      expect(line(r)).toBe(
        `${e + b} questions: ${e} everyday (all from the original set) and ${b} that name the business.`,
      );
      // Read back from generated_reports.contents_snapshot (renderSeededReport renders from the stored row).
      expect(r.data.v2?.questionMix.detail).toMatchObject({
        allOriginal: true,
        agency: 0,
        everyday: e,
      });
      expect(r.data.v2?.questionMix.detail).not.toHaveProperty("split");
      expect(r.pageCount, tier).toBe(off[tier]!.pageCount);
    }
  }, 300_000);

  it("on, with 3 of the basis audit's everyday questions written by the agency: the sourced line, same pages", async () => {
    await flag(seed.orgId, true);
    const prompts = await sql<{ prompt: string; branded: boolean }[]>`
      SELECT prompt, bool_or(is_branded_prompt) AS branded FROM (
        SELECT prompt, is_branded_prompt, prompt_index FROM citations WHERE audit_id = ${seed.basisAuditId}
        UNION ALL
        SELECT prompt, is_branded_prompt, prompt_index FROM engine_call_failures WHERE audit_id = ${seed.basisAuditId}
      ) p GROUP BY prompt ORDER BY min(prompt_index)`;
    const everyday = prompts.filter((p) => !p.branded).map((p) => p.prompt);
    const branded = prompts.filter((p) => p.branded).map((p) => p.prompt);
    await recordSet(seed.orgId, seed.brandId, seed.basisAuditId, everyday, branded, (i) =>
      i >= everyday.length - 3 ? "agency" : "ai_suggested",
    );
    const { questionAgencyName } = await import("@/lib/questions/agency-name");
    const { serviceDb } = await import("@/db/client");
    const agency = await questionAgencyName(serviceDb, seed.orgId, seed.brandId);
    const r = await renderSeededReport(sql, seed, "enhanced");
    const e = everyday.length;
    const b = branded.length;
    expect(line(r)).toBe(
      `${e + b} questions: ${e} everyday (${e - 3} AI-suggested, 3 written by ${agency}) and ${b} that name the business.`,
    );
    expect(r.pageCount).toBe(off.enhanced!.pageCount);
  }, 300_000);
});
