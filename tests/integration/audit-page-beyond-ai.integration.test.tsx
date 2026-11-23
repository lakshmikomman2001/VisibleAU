/**
 * S01 part 6 (contract P07.beyond, LLD 8.1.4): the audit page's "Beyond AI answers" card.
 * - report_v2 off: no card (the page is exactly as before).
 * - report_v2 on: the card with its four tiles, each from the brand's latest result and its own date.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AUDIT_38, type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
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

let client: ReturnType<typeof postgres>;
let fx: ReportFixture;

async function page(): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  const html = renderToStaticMarkup(
    await AuditPage({
      params: Promise.resolve({ auditId: fx.audits[38] }),
      searchParams: Promise.resolve({}),
    }),
  );
  return html.replace(/<!-- -->/g, "");
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  fx = await seedReportFixture(client, { audits: [AUDIT_38] });
  session.organizationId = fx.orgId;
  await client`INSERT INTO technical_audits (brand_id, organization_id, score_composite, findings, created_at)
    VALUES (${fx.brandId}, ${fx.orgId}, '41.00', ${client.json({
      scoringVersion: 4,
      robots: {
        aiBotsAllowed: ["OAI-SearchBot", "Googlebot"],
        aiBotsBlocked: ["Claude-SearchBot"],
        fetchStatus: "found",
      },
    })}, now() - interval '2 days')`;
}, 120_000);

afterAll(async () => {
  await client`DELETE FROM technical_audits WHERE brand_id = ${fx.brandId}`;
  await client`DELETE FROM org_feature_flags WHERE organization_id = ${fx.orgId}`;
  await fx.cleanup();
  await client.end();
});

describe("the audit page's Beyond AI answers card", () => {
  it("report_v2 off: no card", async () => {
    const html = await page();
    expect(html).not.toContain('data-testid="p07-beyond"');
    expect(html).not.toContain("Beyond AI answers");
  }, 120_000);

  it("report_v2 on: the four tiles from the brand's latest results", async () => {
    await client`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${fx.orgId}, 'report_v2', true)`;
    const html = await page();
    expect(html).toContain('data-testid="p07-beyond"');
    for (const key of ["identity", "youtube", "crawlers", "technical"]) {
      expect(html).toContain(`data-testid="p07-beyond-${key}"`);
    }
    expect(html).toContain("Separate from the Visibility score");
    expect(html).toContain("No ABN on file");
    expect(html).toContain("1 search crawler blocked");
    expect(html).toContain("Blocked: Claude-SearchBot");
    expect(html).toMatch(/>41<\/span> <span[^>]*>of 74</);
  }, 120_000);
});
