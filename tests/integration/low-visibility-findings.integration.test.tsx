/**
 * S01 part 3 (LLD 8.1.5, T5): findings g-j on a real database, for an audit shaped like TechCore IT's #52 (named in
 * none of the everyday answers; other IT providers' sites and directories outside the brand's type cited; Claude,
 * asked about the business by name, said it couldn't find it; no ABN, no Google Business Profile).
 * - report_v2 off (no flag rows): the audit page's actions and the PDF are today's -- no g-j, and the PDF still says
 *   "No finding rule matched this audit".
 * - report_v2 on for the workspace: g, h, i, j on the audit page and in the PDF, no "No finding rule matched", and
 *   the four Action Center items (Frequency or Source citation).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { collectPdfText } from "@/tests/helpers/pdf-text";
import {
  BRANDED_QUESTIONS,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn(async () => null) }));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let fx: ReportFixture;
const CLAUDE_SENTENCE =
  "I was unable to find any verified information about a company specifically called TechCoreIT in Riverstone.";

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  fx = await seedReportFixture(sql, {
    brandName: "TechCore IT",
    tier: "growth",
    audits: [
      {
        number: 52,
        completedAt: "2026-11-20T03:00:00.000Z",
        mentions: {},
        directories: {
          "kangaroo-it.com.au": 27,
          "crystaltec.com.au": 6,
          "localbusinessguide.com.au": 9,
          "cylex-australia.com": 2,
        },
      },
    ],
  });
  await sql`
    UPDATE citations SET response_text = ${`I need to be upfront with you. ${CLAUDE_SENTENCE} Ask for references.`}
    WHERE audit_id = ${fx.audits[52]} AND engine = 'claude' AND prompt = ${BRANDED_QUESTIONS[0]}
  `;
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM action_items WHERE organization_id = ${fx.orgId}`;
  await fx.cleanup();
  await sql.end();
});

async function pageActions() {
  const { db } = await import("@/db/client");
  const { auditEvidenceActions } = await import("@/lib/reports/audit-findings");
  return auditEvidenceActions(db, {
    organizationId: fx.orgId,
    brandId: fx.brandId,
    auditId: fx.audits[52],
  });
}

async function pdfText(): Promise<string> {
  const { serviceDb: db } = await import("@/db/client");
  const { buildReportData } = await import("@/lib/reports/report-data");
  const { ReportDocument } = await import("@/lib/reports/pdf/report-document");
  const data = await buildReportData(db, {
    organizationId: fx.orgId,
    brandId: fx.brandId,
    periodType: "weekly",
    periodLabel: "Week 47",
    auditId: fx.audits[52],
    now: new Date("2026-11-21T00:00:00.000Z"),
  });
  if (!data) throw new Error("no report data");
  return collectPdfText(<ReportDocument data={data} />).join("\n");
}

async function setReportV2(on: boolean) {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${fx.orgId} AND flag_key = 'report_v2'`;
  if (on) {
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${fx.orgId}, 'report_v2', true)`;
  }
}

describe("TechCore IT #52's shape on a real database", () => {
  it("report_v2 off: today's page and PDF (no g-j; the PDF says no rule matched)", async () => {
    await setReportV2(false);
    const rules = (await pageActions()).map((f) => f.rule);
    expect(rules.some((r) => ["g", "h", "i", "j"].includes(r))).toBe(false);
    expect(await pdfText()).toContain("No finding rule matched this audit.");
  });

  it("report_v2 on: g, h, i, j on the audit page with their evidence", async () => {
    await setReportV2(true);
    const actions = await pageActions();
    expect(actions.map((f) => f.rule)).toEqual(["g", "h", "i", "j"]);
    const byRule = Object.fromEntries(actions.map((f) => [f.rule, f]));
    expect(byRule.g.evidence[0].map((p) => p.text).join("")).toBe(
      "kangaroo-it.com.au → cited in 27 of 40 answers",
    );
    expect(byRule.h.explanation).toContain(CLAUDE_SENTENCE);
    // S01B part 6e, LLD amendment 56: "Evidence lines print ... 'your profile: not linked yet' in lower case".
    expect(byRule.i.evidence.map((l) => l.map((p) => p.text).join(""))).toEqual([
      "Local Business Guide → cited in 9 of 40 answers · your profile: not linked yet",
      "Cylex → cited in 2 of 40 answers · your profile: not linked yet",
    ]);
    expect(byRule.j.evidence[0].map((p) => p.text).join("")).toBe("ABN → No ABN on file");
  });

  it("report_v2 on: the PDF shows the findings and never says no rule matched", async () => {
    await setReportV2(true);
    const text = await pdfText();
    expect(text).not.toContain("No finding rule matched");
    expect(text).toContain("AI recommends other providers instead");
    expect(text).toContain("Claude couldn't find information about TechCore IT");
    expect(text).toContain("AI cites directories you're not on yet");
    // S01B part 4d (LLD amendment 52: "Today's findings limit stays in every tier: at most 3 problem findings and 1
    // strength, by impact; the rest appear only as actions and in the Action Center"): g and h are high impact, i
    // and j medium, so j (rule order after i) is the fourth problem and isn't a card; its Action Center item is below.
    expect(text).not.toContain("Your business identity isn't verified yet");
  });

  it("report_v2 on: the four Action Center items, Frequency or Source citation", async () => {
    await setReportV2(true);
    const { db } = await import("@/db/client");
    const { findingRecommendations } = await import("@/lib/reports/finding-recommendations");
    const items = await findingRecommendations(db, {
      organizationId: fx.orgId,
      brandId: fx.brandId,
      auditId: fx.audits[52],
    });
    expect(items.map((i) => [i.recommendationKey, i.dimension])).toEqual([
      ["finding-others-named", "frequency"],
      ["finding-could-not-find", "frequency"],
      ["finding-directories-not-on", "accuracy"],
      ["finding-identity-not-verified", "accuracy"],
    ]);
    await setReportV2(false);
    expect(
      await findingRecommendations(db, {
        organizationId: fx.orgId,
        brandId: fx.brandId,
        auditId: fx.audits[52],
      }),
    ).toEqual([]);
  });
});
