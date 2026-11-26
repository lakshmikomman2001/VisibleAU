/**
 * S01 part 12 (contract P13; LLD 8.1.6, 8.1.7): the client portal's reports, on a real database.
 * - The invite's brand's generated reports with a PDF, newest first, each with its report type's name (the snapshot's;
 *   a report from before tiers reads the workspace's Basic name), period, basis audit and printed Visibility, and a
 *   signed download link (PORTAL_LINK_SECONDS); never another brand's report, never another workspace's, never one
 *   without a PDF.
 * - report_v2 off: the portal as today (no Reports card).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const signed = vi.hoisted(() => ({ calls: [] as Array<[string, number | undefined]> }));
vi.mock("@/lib/storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage")>()),
  getStorage: () => ({
    getDownloadUrl: async (path: string, seconds?: number) => {
      signed.calls.push([path, seconds]);
      return `https://storage.example/signed/${path}?expires=${seconds}`;
    },
  }),
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let a: ReportFixture;
let other: ReportFixture;
const TOKEN = `portal-${randomUUID()}`;
const ids = {
  own: randomUUID(),
  old: randomUUID(),
  noPdf: randomUUID(),
  otherBrand: randomUUID(),
  otherOrg: randomUUID(),
};

async function report(
  fx: ReportFixture,
  id: string,
  brandId: string,
  opts: { pdf: boolean; snapshot: object | null; tier: string; at: string },
) {
  await sql`
    INSERT INTO generated_reports (id, brand_id, organization_id, audit_id, report_type, period_label, narrative_text,
      headline, report_tier, contents_snapshot, pdf_url, created_at)
    VALUES (${id}, ${brandId}, ${fx.orgId}, ${fx.audits[54]}, 'weekly', ${`2026-W${id.slice(0, 2)}`}, 'n', 'h',
      ${opts.tier}, ${opts.snapshot ? sql.json(JSON.parse(JSON.stringify(opts.snapshot))) : null},
      ${opts.pdf ? `${fx.orgId}/${id}.pdf` : null}, ${opts.at})`;
}

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  const audit = [
    { number: 54, completedAt: "2026-11-20T03:00:00.000Z", mentions: { chatgpt: [1] } },
  ];
  a = await seedReportFixture(sql, {
    brandName: "Wren Home Services",
    agencyName: "Possum Marketing",
    tier: "agency",
    audits: audit,
  });
  other = await seedReportFixture(sql, {
    brandName: "Other Co",
    agencyName: "Other Agency",
    tier: "agency",
    audits: audit,
  });
  await sql`UPDATE agency_brand_assets SET report_tier_names = ${sql.json({ basic: "Essentials", standard: "Growth Plan", enhanced: "Premium Audit" })}
    WHERE organization_id = ${a.orgId} AND brand_id IS NULL`;
  const [second] = await sql<{ id: string }[]>`
    INSERT INTO brands (organization_id, name, domain, vertical, region) VALUES (${a.orgId}, 'Second Brand', ${`second-${a.orgId.slice(0, 8)}.com.au`}, 'tradies', 'au') RETURNING id`;
  await report(a, ids.own, a.brandId, {
    pdf: true,
    tier: "enhanced",
    at: "2026-11-21T00:00:00Z",
    snapshot: { schema: 1, tierName: "Gold", headline: { mentioned: 4, answers: 40 } },
  });
  await report(a, ids.old, a.brandId, {
    pdf: true,
    tier: "basic",
    at: "2026-11-01T00:00:00Z",
    snapshot: null,
  });
  await report(a, ids.noPdf, a.brandId, {
    pdf: false,
    tier: "basic",
    at: "2026-11-22T00:00:00Z",
    snapshot: null,
  });
  await report(a, ids.otherBrand, second.id, {
    pdf: true,
    tier: "basic",
    at: "2026-11-21T00:00:00Z",
    snapshot: null,
  });
  await report(other, ids.otherOrg, other.brandId, {
    pdf: true,
    tier: "basic",
    at: "2026-11-21T00:00:00Z",
    snapshot: null,
  });
  await sql`INSERT INTO client_portal_invites (organization_id, brand_id, invite_token, invitee_name)
    VALUES (${a.orgId}, ${a.brandId}, ${TOKEN}, 'Wren client')`;
}, 60_000);

afterAll(async () => {
  for (const fx of [a, other]) {
    await sql`DELETE FROM generated_reports WHERE organization_id = ${fx.orgId}`;
    await sql`DELETE FROM client_portal_invites WHERE organization_id = ${fx.orgId}`;
    await sql`DELETE FROM org_feature_flags WHERE organization_id = ${fx.orgId}`;
  }
  await sql`DELETE FROM brands WHERE organization_id = ${a.orgId} AND name = 'Second Brand'`;
  await a.cleanup();
  await other.cleanup();
  await sql.end();
});

async function portal(flag: boolean): Promise<string> {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${a.orgId}`;
  if (flag)
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${a.orgId}, 'report_v2', true)`;
  const { default: Page } = await import("@/app/client-portal/[inviteToken]/page");
  return renderToStaticMarkup(await Page({ params: Promise.resolve({ inviteToken: TOKEN }) }));
}

describe("the client portal's reports (P13)", () => {
  it("only the portal brand's reports with a PDF, newest first, with their names, audit, Visibility and a signed link", async () => {
    signed.calls.length = 0;
    const html = await portal(true);
    expect(html).toContain('data-testid="p13-reports"');
    const rows = html.split('data-testid="p13-row"').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Gold");
    expect(rows[0]).toContain("Audit #54");
    expect(rows[0]).toContain("10%");
    expect(rows[1]).toContain("Essentials");
    expect(html).toContain(`https://storage.example/signed/${a.orgId}/${ids.own}.pdf?expires=600`);
    expect(signed.calls.map(([path]) => path).sort()).toEqual(
      [`${a.orgId}/${ids.own}.pdf`, `${a.orgId}/${ids.old}.pdf`].sort(),
    );
    for (const id of [ids.noPdf, ids.otherBrand, ids.otherOrg]) expect(html).not.toContain(id);
  });

  it("report_v2 off: the portal as today, no Reports card", async () => {
    const html = await portal(false);
    expect(html).not.toContain('data-testid="p13-reports"');
  });
});
