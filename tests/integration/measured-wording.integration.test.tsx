/**
 * S01C part 2 (LLD amendments 59-61): findings and actions say only what the audit measured. Quoted from the real
 * reports (audit #54): rule i said "AI cites directories you're not on yet" and "Create or claim ... then link them",
 * Recommended next said "Get listed on ...", today's directory finding said "... then claim or complete them" and
 * "nine directories" where page 2 said 13, the Gemini finding said "Review your Google Business Profile" (a claim
 * about what Gemini reads) under a Recommended next titled with the problem, and rule j said "Verify your ABN" for a
 * brand with no ABN.
 *
 * Invented businesses seeded as real audits (tests/helpers/report-seeds.ts), every tier and report_v2 off:
 * - Bluegum with Gemini's answers citing directories (Yellow Pages 5, hipages 2, Airtasker 1): rule b's action;
 * - Bluegum as seeded (Gemini cited no directory): rule b with no action and no Recommended next item;
 * - Kurrajong with no ABN on file: rule i, rule j by cause.
 * The Action Center items the audit made (findings g-j) match what the PDF prints, and the audit page lists the same.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reportFindings } from "@/lib/reports/report-findings";
import {
  BLUEGUM,
  KURRAJONG,
  type SeededReportBrand,
  type SeedSpec,
  seedReportBrand,
} from "@/tests/helpers/report-seeds";
import {
  REPORT_VERSIONS,
  type RenderedReport,
  type ReportVersion,
  renderSeededReport,
} from "@/tests/helpers/seeded-report-render";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/reports/enhanced-check-runners", () => ({
  enhancedRunners: () => ({ site: async () => {}, youtube: async () => {} }),
}));

/** What we can't know from an audit, said as if known (the prompt's list). */
const NEVER = [
  "you're not on",
  "Get listed on",
  "Create or claim",
  "claim or complete them",
  "Review your Google Business Profile",
];

/** Bluegum, with enough citations that Gemini's answers (the third engine's ten) cite directories too. */
const BLUEGUM_GEMINI_CITES: SeedSpec = {
  ...BLUEGUM,
  audits: BLUEGUM.audits.map((a) =>
    a.number === 54
      ? {
          ...a,
          directories: {
            "yellowpages.com.au": 25,
            "hipages.com.au": 22,
            "airtasker.com": 21,
            "localsearch.com.au": 4,
          },
        }
      : a,
  ),
};
const KURRAJONG_NO_ABN: SeedSpec = { ...KURRAJONG, abn: null, entity: null };

// S04 part 0g (LLD amendment 87): "A directory the directory actions already name ... isn't repeated in rule b's
// action" -- today's directory finding names hipages and Airtasker (with Localsearch), so rule b lists Yellow Pages.
const GEMINI_ACTION =
  "Make sure your profile on Yellow Pages, the directory Gemini cites most, is complete and linked in brand settings";

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
const seeds: Record<"geminiCites" | "geminiSilent" | "noAbn", SeededReportBrand | null> = {
  geminiCites: null,
  geminiSilent: null,
  noAbn: null,
};
const reports = new Map<string, Record<ReportVersion, RenderedReport>>();

async function renderAll(name: string, seed: SeededReportBrand) {
  const byVersion: Partial<Record<ReportVersion, RenderedReport>> = {};
  for (const v of REPORT_VERSIONS) byVersion[v] = await renderSeededReport(sql, seed, v);
  reports.set(name, byVersion as Record<ReportVersion, RenderedReport>);
}

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  seeds.geminiCites = await seedReportBrand(sql, BLUEGUM_GEMINI_CITES);
  seeds.geminiSilent = await seedReportBrand(sql, BLUEGUM);
  seeds.noAbn = await seedReportBrand(sql, KURRAJONG_NO_ABN);
  for (const [name, seed] of Object.entries(seeds)) if (seed) await renderAll(name, seed);
}, 600_000);

afterAll(async () => {
  for (const seed of Object.values(seeds)) await seed?.cleanup();
  await sql.end();
});

const report = (name: keyof typeof seeds, v: ReportVersion) => {
  const r = reports.get(name)?.[v];
  if (!r) throw new Error(`${name} ${v} wasn't rendered`);
  return r;
};
const findingsOf = (r: RenderedReport) => reportFindings(r.data);
const count = (text: string, s: string) => text.split(s).length - 1;

describe.each(
  REPORT_VERSIONS.map((v) => [v === "today" ? "report_v2 off" : v, v] as const),
)("the PDF, %s", (_name, v) => {
  it("never says we know a listing exists or is missing, or what an engine reads", () => {
    for (const name of Object.keys(seeds) as Array<keyof typeof seeds>) {
      const { text } = report(name, v);
      for (const phrase of NEVER) expect(text, `${name}: "${phrase}"`).not.toContain(phrase);
    }
  });

  it("an engine that never names you: the directories it cited most, and one action in both places", () => {
    const r = report("geminiCites", v);
    const b = findingsOf(r).find((f) => f.rule === "b");
    expect(b?.fix).toBe(GEMINI_ACTION);
    expect(b?.recommendation.title).toBe(GEMINI_ACTION);
    // S04 part 0g (LLD amendment 87): 'Its reason says why these directories: "{Engine} didn't name you in any of its
    // {n} answers to everyday questions. These are the directories it cited most in them.", where {n} is the per-engine
    // panel's count'.
    const gemini = r.data.engines.find((e) => e.engine === "gemini");
    expect(b?.recommendation.detail).toBe(
      `Gemini didn't name you in any of its ${gemini?.sampleCount} answers to everyday questions. These are the directories it cited most in them.`,
    );
    expect(r.text).toContain("Gemini cited most → ");
    expect(r.text).toContain("Yellow Pages (5), hipages (2), Airtasker (1)");
    // The card's action line, and Basic's Recommended next title (Standard and Enhanced list the finding once).
    expect(count(r.text, GEMINI_ACTION)).toBe(v === "today" || v === "basic" ? 2 : 1);
  });

  it("an engine that never names you and cited no directory: no action line, no Recommended next item", () => {
    const r = report("geminiSilent", v);
    const b = findingsOf(r).find((f) => f.rule === "b");
    expect(b?.noAction).toBe(true);
    expect(r.text).toContain("Gemini doesn't mention you");
    expect(r.text).not.toContain("Gemini cited most");
    expect(r.text).not.toContain("Gemini didn't name you in any of");
    expect(r.text).not.toContain("the directories Gemini cites most");
  });

  it("today's directory finding says its scope, in numerals, and links or creates", () => {
    const r = report("geminiCites", v);
    const a = findingsOf(r).find((f) => f.rule === "a");
    expect(a?.explanation).toBe(
      "AI engines answer local questions by citing directories. They cited 4 of the usual directories for your type of business 72 times. Yellow Pages is linked: 3 of its 25 citations were your own profile. 3 of them aren't linked yet, so we can't tell for those.",
    );
    expect(a?.fix).toBe(
      "Add your hipages, Airtasker and Localsearch profile links in brand settings, or create the profiles if you don't have them",
    );
    expect(a?.recommendation.detail).toMatch(
      /^hipages was cited in 22, Airtasker in 21 and Localsearch in 4 of 40 answers; /,
    );
  });

  it("rule i: directories where we can't see the listings, link or create", () => {
    const i = findingsOf(report("noAbn", v)).find((f) => f.rule === "i");
    if (v === "today") {
      // Rules g-j are built only while report_v2 is on (as before S01C).
      expect(i).toBeUndefined();
      return;
    }
    expect(i?.title).toBe("AI also cites directories where we can't see your listings yet");
    expect(i?.fix).toMatch(
      /^Add your .+ profile links? in brand settings, or create the profiles? if you don't have (it|them)$/,
    );
    expect(i?.recommendation.title).toMatch(/^Link or create your .+ profiles?$/);
    expect(i?.recommendation.detail).toMatch(
      / of 40 answers.*; (none of them is|it isn't) linked yet\.$/,
    );
  });

  it("rule j with no ABN: 'Add your ABN and link your Google Business Profile', never 'Verify your ABN'", () => {
    const r = report("noAbn", v);
    expect(r.text).not.toContain("Verify your ABN");
    if (v === "today") return;
    const j = findingsOf(r).find((f) => f.rule === "j");
    expect(j?.recommendation.title).toBe("Add your ABN and link your Google Business Profile");
    if (v !== "basic")
      expect(r.text).toContain("Add your ABN and link your Google Business Profile");
  });
});

describe("the same text everywhere", () => {
  it("the Action Center items for findings g-j say what the PDF says", async () => {
    const seed = seeds.noAbn;
    if (!seed) throw new Error("not seeded");
    const items = await sql<{ recommendation_key: string; title: string; action: string }[]>`
      SELECT recommendation_key, title, action FROM action_items
      WHERE audit_id = ${seed.basisAuditId} AND recommendation_key LIKE 'finding-%'`;
    const findings = findingsOf(report("noAbn", "standard"));
    const byKey: Record<string, string> = {
      "finding-others-named": "g",
      "finding-could-not-find": "h",
      "finding-directories-not-on": "i",
      "finding-identity-not-verified": "j",
    };
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const f = findings.find((x) => x.rule === byKey[item.recommendation_key]);
      expect(f, item.recommendation_key).toBeDefined();
      expect(item.title).toBe(f?.recommendation.title);
      expect(item.action).toBe(`${f?.recommendation.detail} ${f?.fix}.`);
      for (const phrase of [...NEVER, "Verify your ABN"]) expect(item.action).not.toContain(phrase);
    }
  });

  it("the audit page lists the same actions as Basic's Recommended next", async () => {
    const seed = seeds.geminiSilent;
    if (!seed) throw new Error("not seeded");
    const { serviceDb } = await import("@/db/client");
    const { auditEvidenceActions } = await import("@/lib/reports/audit-findings");
    const actions = await auditEvidenceActions(serviceDb, {
      organizationId: seed.orgId,
      brandId: seed.brandId,
      auditId: seed.basisAuditId,
    });
    expect(actions.map((f) => f.rule)).not.toContain("b");
    const basic = report("geminiSilent", "basic").text;
    for (const f of actions) expect(basic).toContain(f.recommendation.title);
  });
});
