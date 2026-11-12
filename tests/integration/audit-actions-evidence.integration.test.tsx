/**
 * Sri's decision (7 Nov) -- under an audit, "from this audit" lists only what that audit's answers measured:
 * the PDF report's own "Recommended next" for the audit (the same rules over the same counts,
 * lib/reports/audit-findings.ts), each saying its counts. Audit #41 listed "Get mentioned in relevant Reddit
 * threads" at Medium beside its measured directory action though none of its answers cited Reddit: that
 * rule fired on a low mention rate alone. Now a recommendation with no evidence in the audit is general
 * advice, apart, under "General advice for <category>", and never above Low; and the labels say what they
 * mean instead of "Not verified" and "Checked <date>".
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ENTITY_PROFILES_TITLE } from "@/lib/recommendations/entity-profiles";
import { ReportDocument } from "@/lib/reports/pdf/report-document";
import { reportFindings } from "@/lib/reports/report-findings";
import { collectPdfText } from "@/tests/helpers/pdf-text";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
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

const REDDIT_TITLE = "Get mentioned in relevant Reddit threads";
const DIRECTORY_TITLE =
  "AI cited hipages in 12 of 40 answers — confirm your status, and 1 more directory";
/** When the stored items were generated: 7 Nov 2026 in Sydney. */
const GENERATED_AT = "2026-11-06T23:30:00.000Z";

let client: ReturnType<typeof postgres>;
let fx: ReportFixture;

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  const answers = {
    mentions: { chatgpt: [1, 2], claude: [1], gemini: [], perplexity: [1, 3] },
    directories: { "hipages.com.au": 12, "wordofmouth.com.au": 8 },
    methodologyVersion: 3,
  };
  fx = await seedReportFixture(client, {
    audits: [
      // #41's shape: AI cited directories, never Reddit.
      { number: 41, completedAt: "2026-11-06T23:00:00.000Z", ...answers, reddit: 0 },
      // The same, with a Reddit thread cited in 3 of the 40 everyday answers.
      { number: 43, completedAt: "2026-11-07T01:00:00.000Z", ...answers, reddit: 3 },
    ],
  });
  session.organizationId = fx.orgId;
  // #41's three stored Action Center items, as the generator writes them, on both audits.
  for (const auditId of [fx.audits[41], fx.audits[43]]) {
    for (const item of [
      ["directory-visibility", DIRECTORY_TITLE, "high", "inferred"],
      ["reddit-absence", REDDIT_TITLE, "medium", "inferred"],
      ["entity-profiles", ENTITY_PROFILES_TITLE, "low", "verified"],
    ]) {
      await client`
        INSERT INTO action_items (organization_id, brand_id, audit_id, recommendation_key, dimension,
                                  title, action, confidence_label, expected_impact_score,
                                  confidence_basis, created_at)
        VALUES (${fx.orgId}, ${fx.brandId}, ${auditId}, ${item[0]}, 'frequency', ${item[1]},
                'Do the thing.', 'likely', ${item[2]}, ${item[3]}, ${GENERATED_AT})
      `;
    }
  }
}, 120_000);

afterAll(async () => {
  await client`DELETE FROM action_items WHERE brand_id = ${fx.brandId}`;
  await fx.cleanup();
  await client.end();
});

async function auditPage(auditId: string): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  return renderToStaticMarkup(
    await AuditPage({ params: Promise.resolve({ auditId }), searchParams: Promise.resolve({}) }),
  );
}

/** The page's "from this audit" list: each action's priority, title and evidence. */
function evidenceActions(html: string): string[][] {
  return [
    ...html.matchAll(
      // 9 Nov (part 6): an action has no subtitle when there's nothing measured to add; it reads as "".
      /<div data-evidence-action="[a-f]"[^>]*><span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<div data-action-title[^>]*>([\s\S]*?)<\/div>(?:<div data-action-evidence[^>]*>([\s\S]*?)<\/div>)?/g,
    ),
  ].map((m) => [text(m[1]), text(m[2]), text(m[3] ?? "")]);
}

function generalAdvice(html: string): string {
  return text(
    html.match(/<div data-general-advice[^>]*>([\s\S]*?)<\/div><\/div><\/div>/)?.[1] ?? "",
  );
}

/** The PDF report's "Recommended next" for the same audit, from its own data and rules. */
async function pdfActions(auditId: string): Promise<{ actions: string[][]; pdf: string }> {
  const { serviceDb } = await import("@/db/client");
  const { buildReportData } = await import("@/lib/reports/report-data");
  const data = await buildReportData(serviceDb, {
    organizationId: fx.orgId,
    brandId: fx.brandId,
    periodType: "weekly",
    periodLabel: "2026-W45",
    auditId,
    now: new Date("2026-11-09T09:00:00.000Z"),
  });
  if (!data) throw new Error("no report data");
  return {
    actions: reportFindings(data).map((f) => [
      f.severity.short,
      f.recommendation.title,
      f.recommendation.detail ?? "",
    ]),
    pdf: collectPdfText(<ReportDocument data={data} />).join("\n"),
  };
}

describe("no Reddit in any answer (#41): the Reddit advice is general advice", () => {
  it("isn't among the actions from this audit", async () => {
    const html = await auditPage(fx.audits[41]);
    const titles = evidenceActions(html).map((a) => a[1]);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles).not.toContain(REDDIT_TITLE);
  }, 60_000);

  it("sits apart under General advice for general trades, Low, saying what it rests on", async () => {
    const advice = generalAdvice(await auditPage(fx.audits[41]));
    expect(advice).toContain("General advice for general trades");
    expect(advice).toContain("Not drawn from this audit's answers.");
    expect(advice).toContain(
      `Low ${REDDIT_TITLE} General advice, not drawn from this audit's answers`,
    );
    expect(advice).toContain(
      `Low ${ENTITY_PROFILES_TITLE} No Wikipedia article for your business (Wikipedia searched 7 Nov 2026), so your Google, directory and press profiles are what AI can read about you`,
    );
    // The directory item is measured: it's the evidence action's, never general advice.
    expect(advice).not.toContain("confirm your status");
    expect(advice).not.toMatch(/\b(High|Med|Medium)\b/);
  }, 60_000);

  it("no label on the page says Not verified, or Checked and a date", async () => {
    const html = text(await auditPage(fx.audits[41]));
    expect(html).not.toMatch(/Not verified/i);
    expect(html).not.toMatch(/Checked \d/);
  }, 60_000);
});

describe("Reddit cited in 3 of 40 answers (#43): the Reddit advice is from this audit", () => {
  it("says k of n, and isn't repeated as general advice", async () => {
    const html = await auditPage(fx.audits[43]);
    expect(evidenceActions(html)).toContainEqual([
      "Medium",
      REDDIT_TITLE,
      "Reddit was cited in 3 of 40 answers.",
    ]);
    expect(generalAdvice(html)).not.toContain(REDDIT_TITLE);
  }, 60_000);
});

describe("the page and the PDF list the same evidence-based actions", () => {
  it.each([41, 43])("audit #%i", async (n) => {
    const page = evidenceActions(await auditPage(fx.audits[n]));
    const { actions, pdf } = await pdfActions(fx.audits[n]);
    expect(page).toEqual(actions);
    for (const [, title, detail] of actions) {
      expect(pdf).toContain(title);
      expect(pdf).toContain(detail);
    }
    expect(actions.some(([, title]) => title === REDDIT_TITLE)).toBe(n === 43);
  }, 60_000);
});
