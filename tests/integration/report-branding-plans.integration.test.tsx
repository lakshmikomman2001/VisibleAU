/**
 * 2 Nov (Sri's decision) -- white-label report branding is Agency-plan only,
 * as the pricing page says: agency, agency_pro and enterprise. Against the
 * real routes, the local test database, local storage and the real renderers:
 * - on any other plan every save, the preview and the agency's logo upload are
 *   refused, and every reader ignores the rows, which stay: the report PDF,
 *   the audit export and the client portal say "Powered by Vunnara" only, and
 *   Account -> Report branding is a locked card with no preview;
 * - a cancelled agency plan is not an agency plan (cancelling leaves
 *   subscriptions.tier as it was);
 * - a brand's own logo from the new-brand wizard isn't gated;
 * - on an Agency plan nothing changes, and the export now draws the logo.
 *
 * The export's PDFs are written to REPORT_PDF_OUT_DIR for `pdftoppm`.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import { solidPng } from "@/tests/helpers/png";
import {
  AUDIT_37,
  AUDIT_38,
  AUDIT_39,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const currentUser = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser.value),
}));
// lib/storage/index.ts's require() isn't loadable under vitest: the same
// LocalStorageAdapter, writing under STORAGE_LOCAL_DIR.
vi.mock("@/lib/storage", async () => {
  const { LocalStorageAdapter } = await import("@/lib/storage/local-adapter");
  return { getStorage: () => new LocalStorageAdapter() };
});
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
// The real renderer; what the export route hands it is kept for the checks.
const exported = vi.hoisted(() => ({
  calls: [] as Array<{
    data: import("@/lib/pdf/render").AuditPdfData;
    theme: import("@/lib/pdf/theme").PdfTheme;
    logo?: import("@/lib/reports/agency-branding").AgencyLogo | null;
  }>,
}));
vi.mock("@/lib/pdf/render", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pdf/render")>();
  return {
    ...actual,
    renderAuditPdf: vi.fn(
      async (
        data: import("@/lib/pdf/render").AuditPdfData,
        theme: import("@/lib/pdf/theme").PdfTheme,
        sections?: Partial<import("@/lib/pdf/render").PdfSections>,
        logo?: import("@/lib/reports/agency-branding").AgencyLogo | null,
      ) => {
        exported.calls.push({ data, theme, logo });
        return actual.renderAuditPdf(data, theme, sections, logo);
      },
    ),
  };
});

const NOT_ON_PLAN_MESSAGE = "Report branding is part of the Agency plans";
const AGENCY = "Harbour Agency";
const OVERRIDE = "Harbour Agency Digital";
const CONTACT = "hello@example.com · 02 5550 0000";
const FOOTER = "Commercial in confidence";
const OWNER = randomUUID();
const TOKEN = `portal-plans-${randomUUID()}`;
const LOGO_FILE = `${randomUUID()}.png`;
const LOGO = solidPng(64, 64, [168, 85, 247]);
const OUT = process.env.REPORT_PDF_OUT_DIR;

const NOT_AN_AGENCY_PLAN: Array<[string, string | null, string]> = [
  ["no subscription", null, "active"],
  ["free", "free", "active"],
  ["starter", "starter", "active"],
  ["growth", "growth", "active"],
  ["a cancelled agency plan", "agency", "canceled"],
];
const AGENCY_PLANS = ["agency", "agency_pro", "enterprise"];

let sql: ReturnType<typeof postgres>;
let fx: ReportFixture;
let storageDir: string;
let logoUrl: string;

async function setPlan(tier: string | null, status = "active") {
  await sql`DELETE FROM subscriptions WHERE organization_id = ${fx.orgId}`;
  if (!tier) return;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${fx.orgId}, ${`cus_${fx.orgId}`}, ${`sub_${fx.orgId}`}, 'price_test', ${tier}, 'monthly', ${status})
  `;
}

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  storageDir = mkdtempSync(join(tmpdir(), "vunnara-plans-"));
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("STORAGE_LOCAL_DIR", storageDir);
  fx = await seedReportFixture(sql, { tier: "starter", audits: [AUDIT_37, AUDIT_38, AUDIT_39] });

  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER}, ${`plans-${OWNER}`}, ${fx.orgId}, ${`owner-${OWNER.slice(0, 8)}@example.com.au`}, 'owner', 'member')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${fx.orgId}, ${OWNER}, 'owner', now() + interval '7 days', now(), true)
  `;
  await sql`
    INSERT INTO client_portal_invites (organization_id, brand_id, invite_token)
    VALUES (${fx.orgId}, ${fx.brandId}, ${TOKEN})
  `;

  const { storedLogoPath, storedLogoUrl } = await import("@/lib/branding/logo");
  const { LocalStorageAdapter } = await import("@/lib/storage/local-adapter");
  await new LocalStorageAdapter().upload(storedLogoPath(fx.orgId, LOGO_FILE), LOGO, "image/png");
  logoUrl = storedLogoUrl(fx.orgId, LOGO_FILE);
}, 180_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await sql`DELETE FROM audit_trail WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM client_portal_views WHERE invite_id IN (SELECT id FROM client_portal_invites WHERE organization_id = ${fx.orgId})`;
  await sql`DELETE FROM client_portal_invites WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM audit_exports WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM users WHERE organization_id = ${fx.orgId}`;
  await fx?.cleanup();
  await sql?.end();
  rmSync(storageDir, { recursive: true, force: true });
});

beforeEach(async () => {
  currentUser.value = {
    id: OWNER,
    organizationId: fx.orgId,
    role: "member",
    email: "owner@example.com.au",
    organization: { id: fx.orgId, region: "au" },
  };
  // Every test starts from the row a workspace on any plan may hold, say from
  // before it moved down, whatever the test before it did.
  await sql`DELETE FROM agency_brand_assets WHERE organization_id = ${fx.orgId}`;
  await sql`
    INSERT INTO agency_brand_assets (organization_id, brand_id, agency_name, logo_url, footer_text, contact_line, primary_color)
    VALUES (${fx.orgId}, NULL, ${AGENCY}, ${logoUrl}, ${FOOTER}, ${CONTACT}, '#112233')
  `;
});

async function put(body: Record<string, unknown>) {
  const { PUT } = await import("@/app/api/report-branding/route");
  const res = await PUT(
    new Request("http://localhost/api/report-branding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: null, ...body }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function assetRows() {
  return sql`
    SELECT id, brand_id, agency_name, logo_url, footer_text, contact_line, updated_at
    FROM agency_brand_assets WHERE organization_id = ${fx.orgId} ORDER BY id
  `;
}

async function reportData() {
  const { serviceDb } = await import("@/db/client");
  const { buildReportData } = await import("@/lib/reports/report-data");
  const data = await buildReportData(serviceDb, {
    organizationId: fx.orgId,
    brandId: fx.brandId,
    periodType: "weekly",
    periodLabel: "2026-W44",
    auditId: fx.audits[39],
    now: new Date("2026-11-02T08:13:00Z"),
  });
  if (!data) throw new Error("no report data");
  return data;
}

async function exportPdf() {
  const { GET } = await import("@/app/api/audits/[auditId]/export/route");
  const before = exported.calls.length;
  const auditId = fx.audits[39];
  const res = await GET(new Request(`http://localhost/api/audits/${auditId}/export?format=pdf`), {
    params: Promise.resolve({ auditId }),
  });
  expect(res.status).toBe(200);
  const pdf = Buffer.from(await res.arrayBuffer());
  return { pdf, ...exported.calls[before] };
}

async function exportedText(call: Awaited<ReturnType<typeof exportPdf>>) {
  const { AuditReport } = await import("@/lib/pdf/render");
  return collectPdfPages(
    <AuditReport
      data={call.data}
      theme={call.theme}
      logo={call.logo ?? null}
      sections={{
        executive: true,
        scorecard: true,
        engines: true,
        actions: true,
        methodology: false,
      }}
    />,
  )
    .flat()
    .join("\n");
}

async function portalHtml() {
  const Page = (await import("@/app/client-portal/[inviteToken]/page")).default;
  return renderToStaticMarkup(await Page({ params: Promise.resolve({ inviteToken: TOKEN }) }));
}

async function settingsHtml() {
  const Page = (await import("@/app/(auth)/settings/report-branding/page")).default;
  return renderToStaticMarkup(await Page());
}

async function uploadLogo(purpose?: string) {
  const { POST } = await import("@/app/api/branding/logo/route");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(LOGO)], { type: "image/png" }), "logo.png");
  if (purpose) form.append("purpose", purpose);
  const res = await POST(
    new Request("http://localhost/api/branding/logo", { method: "POST", body: form }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function hasImage(pdf: Buffer): boolean {
  return /\/Subtype\s*\/Image/.test(pdf.toString("latin1"));
}

function writeOut(name: string, pdf: Buffer) {
  if (!OUT) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), pdf);
}

describe("on any other plan, nothing about branding can be changed", () => {
  it.each(
    NOT_AN_AGENCY_PLAN,
  )("%s: every save is refused with 403, and nothing changes", async (_label, tier, status) => {
    await setPlan(tier, status);
    const before = await assetRows();

    const workspace = await put({ agencyName: "Changed" });
    expect(workspace).toEqual({ status: 403, body: { error: NOT_ON_PLAN_MESSAGE } });
    expect((await put({ brandId: fx.brandId, agencyName: "Changed" })).status).toBe(403);

    const { DELETE } = await import("@/app/api/report-branding/route");
    const removed = await DELETE(
      new Request(`http://localhost/api/report-branding?brandId=${fx.brandId}`, {
        method: "DELETE",
      }),
    );
    expect(removed.status).toBe(403);

    const { PATCH } = await import("@/app/api/agency/branding/route");
    const patched = await PATCH(
      new Request("http://localhost/api/agency/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyName: "Changed" }),
      }),
    );
    expect(patched.status).toBe(403);

    expect(await assetRows()).toEqual(before);
  });

  it("the preview is refused, and stays private", async () => {
    await setPlan("starter");
    const { GET } = await import("@/app/api/report-branding/preview/route");
    const res = await GET(
      new Request("http://localhost/api/report-branding/preview?agencyName=Changed"),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: NOT_ON_PLAN_MESSAGE });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("the agency's logo upload is refused; a brand's own logo from the wizard isn't gated", async () => {
    await setPlan("starter");
    expect(await uploadLogo("agency")).toEqual({
      status: 403,
      body: { error: NOT_ON_PLAN_MESSAGE },
    });
    expect((await uploadLogo("brand")).status).toBe(201);
    expect((await uploadLogo()).status).toBe(201);
  });
});

describe("on any other plan, the readers ignore the rows", () => {
  it.each(NOT_AN_AGENCY_PLAN)(
    "%s: the report prints no agency, though the row exists",
    async (_label, tier, status) => {
      await setPlan(tier, status);
      expect((await assetRows()).some((r) => r.agency_name === AGENCY)).toBe(true);
      expect((await reportData()).agency).toEqual({
        name: null,
        logoUrl: null,
        contactLine: null,
        footerText: null,
      });
    },
    60_000,
  );

  it("the report PDF's cover says only 'Powered by Vunnara', with no logo, and no page names the agency", async () => {
    await setPlan("starter");
    const data = await reportData();
    const { buildReportPdf, ReportDocument } = await import("@/lib/communication/pdf-builder");
    const pages = collectPdfPages(<ReportDocument data={data} logo={null} />);
    const all = pages.flat().join("\n");
    expect(pages[0].join("\n")).toContain("Powered by");
    for (const hidden of [AGENCY, CONTACT, FOOTER]) expect(all).not.toContain(hidden);
    expect(all).toContain(`Confidential · Prepared for ${data.brand.name}`);
    const pdf = await buildReportPdf(data);
    expect(hasImage(pdf)).toBe(false);
    writeOut("report-starter-no-agency.pdf", pdf);
  }, 120_000);

  it("the audit export says only 'Powered by Vunnara', with the default colours and footer and no logo", async () => {
    await setPlan("starter");
    const call = await exportPdf();
    expect(call.theme).toMatchObject({
      agencyName: null,
      logoUrl: null,
      contactLine: "",
      footerText: "Confidential",
      primaryColor: "#0066CC",
    });
    expect(call.logo ?? null).toBeNull();
    expect(hasImage(call.pdf)).toBe(false);
    const text = await exportedText(call);
    expect(text).toContain("Powered by Vunnara");
    for (const hidden of [AGENCY, CONTACT, FOOTER]) expect(text).not.toContain(hidden);
    writeOut("export-starter-no-agency.pdf", call.pdf);
  }, 120_000);

  it("the client portal says only 'Powered by Vunnara': no agency name, logo, contact or footer", async () => {
    await setPlan("starter");
    const html = await portalHtml();
    expect(html).toContain("Powered by Vunnara");
    for (const hidden of [AGENCY, CONTACT, FOOTER, logoUrl]) expect(html).not.toContain(hidden);
  }, 60_000);

  it("the reading APIs say nothing is available, so no hint promises it", async () => {
    await setPlan("starter");
    const { GET } = await import("@/app/api/report-branding/route");
    const res = await GET(
      new Request(`http://localhost/api/report-branding?brandId=${fx.brandId}`),
    );
    expect(await res.json()).toEqual({
      agencyName: null,
      logoSet: false,
      canEdit: false,
      available: false,
    });
    const old = await import("@/app/api/agency/branding/route");
    expect(await (await old.GET()).json()).toEqual({ branding: null });
  });

  it("Account -> Report branding is a locked card: says so, links to pricing, no form and no preview", async () => {
    await setPlan("starter");
    const html = await settingsHtml();
    expect(html).toContain("data-branding-locked");
    expect(html).toContain(NOT_ON_PLAN_MESSAGE);
    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain("data-report-branding-form");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("/api/report-branding/preview");
    for (const hidden of [AGENCY, CONTACT, FOOTER]) expect(html).not.toContain(hidden);
  });
});

describe("on an Agency plan, nothing changes", () => {
  it.each(AGENCY_PLANS)("%s: saves, prints and previews its branding", async (tier) => {
    await setPlan(tier);

    expect(
      (await put({ agencyName: AGENCY, logoUrl, footerText: FOOTER, contactLine: CONTACT })).status,
    ).toBe(200);
    expect((await reportData()).agency).toEqual({
      name: AGENCY,
      logoUrl,
      contactLine: CONTACT,
      footerText: FOOTER,
    });

    const portal = await portalHtml();
    expect(portal).toContain(logoUrl);
    expect(portal).toContain(CONTACT);
    expect(portal).not.toContain("Powered by Vunnara");

    const settings = await settingsHtml();
    expect(settings).toContain("data-report-branding-form");
    expect(settings).not.toContain("data-branding-locked");

    const { GET } = await import("@/app/api/report-branding/route");
    const res = await GET(
      new Request(`http://localhost/api/report-branding?brandId=${fx.brandId}`),
    );
    expect(await res.json()).toEqual({
      agencyName: AGENCY,
      logoSet: true,
      canEdit: true,
      available: true,
    });

    const preview = await import("@/app/api/report-branding/preview/route");
    const shown = await preview.GET(
      new Request(`http://localhost/api/report-branding/preview?agencyName=Harbour`),
    );
    expect(shown.status).toBe(200);

    expect((await uploadLogo("agency")).status).toBe(201);
  }, 120_000);

  it("the audit export draws the saved logo beside the agency's name", async () => {
    await setPlan("agency");
    const call = await exportPdf();
    expect(call.theme).toMatchObject({
      agencyName: AGENCY,
      logoUrl,
      contactLine: CONTACT,
      footerText: FOOTER,
      primaryColor: "#112233",
    });
    expect(call.logo?.format).toBe("png");
    expect(call.logo?.data.equals(LOGO)).toBe(true);
    expect(hasImage(call.pdf)).toBe(true);
    const text = await exportedText(call);
    expect(text).toContain(AGENCY);
    expect(text).toContain(CONTACT);
    expect(text).not.toContain("Powered by Vunnara");
    writeOut("export-agency-with-logo.pdf", call.pdf);
  }, 120_000);

  it("a brand's override wins on the export too, field by field", async () => {
    await setPlan("agency");
    expect((await put({ brandId: fx.brandId, agencyName: OVERRIDE })).status).toBe(200);
    const call = await exportPdf();
    expect(call.theme).toMatchObject({ agencyName: OVERRIDE, logoUrl, contactLine: CONTACT });
    expect(hasImage(call.pdf)).toBe(true);
    expect((await put({ brandId: fx.brandId, agencyName: "" })).status).toBe(200);
  }, 120_000);

  it("a workspace that moves down keeps its rows, and has them back when it moves up", async () => {
    await setPlan("starter");
    expect((await reportData()).agency.name).toBeNull();
    await setPlan("agency");
    expect((await reportData()).agency.name).toBe(AGENCY);
  }, 120_000);
});
