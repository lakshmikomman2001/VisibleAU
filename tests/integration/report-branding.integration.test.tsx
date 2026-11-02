/**
 * 2 Nov ("where does Sri set the agency name and logo for the report
 * cover?", part 3) -- Settings -> Report branding, against the real routes,
 * the local test database, local storage and the real PDF renderer:
 * - owners and admins save (in place: one workspace row, audit-trailed);
 *   analysts and viewers get 403 from every route that changes branding,
 *   the old /api/agency/branding PATCH included;
 * - the partial unique index stops a second workspace row; before it's
 *   there, every reader takes the newest row, the save updates that row,
 *   and the production fix (db/prod-fixes/0114-..., run here as written)
 *   backs the rows up, keeps the newest and adds the index -- and its
 *   rollback puts them back;
 * - the saved name and uploaded logo are on the rendered PDF cover (the
 *   PDF is written to REPORT_PDF_OUT_DIR for `pdftoppm`);
 * - a brand's override wins for that brand only, field by field;
 * - the preview is the report's own top bar and footer; the reports page's
 *   hint reads the agency name any member's reports print.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  EVERYDAY_QUESTIONS,
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
const navigation = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: navigation.redirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const ROLES = ["owner", "admin", "analyst", "viewer"] as const;
type Role = (typeof ROLES)[number];
const PEOPLE: Record<Role, string> = {
  owner: randomUUID(),
  admin: randomUUID(),
  analyst: randomUUID(),
  viewer: randomUUID(),
};
const BRAND_B = randomUUID();
const AUDIT_B = randomUUID();
const LOGO = solidPng(64, 64, [168, 85, 247]);
const OUT = process.env.REPORT_PDF_OUT_DIR;
const PROD_FIX = (step: string) =>
  readFileSync(
    join(process.cwd(), `db/prod-fixes/0114-agency-branding-one-workspace-row-${step}.sql`),
    "utf8",
  );
const MIGRATION_0114 = readFileSync(
  join(process.cwd(), "db/migrations/0114_agency_brand_assets_one_workspace_row.sql"),
  "utf8",
);

let sql: ReturnType<typeof postgres>;
let fx: ReportFixture;
let storageDir: string;

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  storageDir = mkdtempSync(join(tmpdir(), "vunnara-branding-"));
  await sql`DROP TABLE IF EXISTS _backup_0114_agency_brand_assets`;
  await sql.unsafe(MIGRATION_0114).simple();
  fx = await seedReportFixture(sql, { audits: [AUDIT_37, AUDIT_38, AUDIT_39] });
  for (const role of ROLES) {
    const id = PEOPLE[role];
    await sql`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${id}, ${`brand-${id}`}, ${fx.orgId}, ${`${role}-${id.slice(0, 8)}@example.com.au`}, ${role}, 'member')
    `;
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${fx.orgId}, ${id}, ${role}, now() + interval '7 days', now(), true)
    `;
  }
  // A second brand in the workspace, with one complete audit.
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_B}, ${fx.orgId}, 'Sigma Plumbing', ${`sigma-${BRAND_B.slice(0, 8)}.example.com.au`}, 'tradies', 'au', ARRAY[]::text[])
  `;
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count,
                        runs_per_prompt, metadata, started_at, completed_at, methodology_version)
    VALUES (${AUDIT_B}, ${BRAND_B}, ${fx.orgId}, 40, 'complete', ${["chatgpt"]}, 10, 1, ${sql.json({})},
            '2026-10-31T19:57:00Z', '2026-10-31T20:00:00Z', 2)
  `;
  await sql`INSERT INTO citations ${sql(
    EVERYDAY_QUESTIONS.map((prompt, i) => ({
      audit_id: AUDIT_B,
      engine: "chatgpt",
      prompt,
      prompt_index: i,
      run_number: 1,
      brand_mentioned: false,
      is_branded_prompt: false,
      response_snippet: "No mention.",
    })),
  )}`;
}, 180_000);

afterAll(async () => {
  await sql`DROP TABLE IF EXISTS _backup_0114_agency_brand_assets`;
  await sql.unsafe(MIGRATION_0114).simple();
  await sql`DELETE FROM audit_trail WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM agency_brand_assets WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM citations WHERE audit_id = ${AUDIT_B}`;
  await sql`DELETE FROM audits WHERE id = ${AUDIT_B}`;
  await sql`DELETE FROM brands WHERE id = ${BRAND_B}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM users WHERE organization_id = ${fx.orgId}`;
  await fx?.cleanup();
  await sql?.end();
  rmSync(storageDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("STORAGE_LOCAL_DIR", storageDir);
});

function signIn(role: Role) {
  currentUser.value = {
    id: PEOPLE[role],
    organizationId: fx.orgId,
    role: "member",
    email: `${role}@example.com.au`,
    organization: { id: fx.orgId, region: "au" },
  };
}

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

async function workspaceRows() {
  return sql<{ id: string; agency_name: string | null; updated_at: Date }[]>`
    SELECT id, agency_name, updated_at FROM agency_brand_assets
    WHERE organization_id = ${fx.orgId} AND brand_id IS NULL ORDER BY updated_at DESC
  `;
}

async function reportAgency(brandId: string, auditId: string) {
  const { serviceDb } = await import("@/db/client");
  const { buildReportData } = await import("@/lib/reports/report-data");
  const data = await buildReportData(serviceDb, {
    organizationId: fx.orgId,
    brandId,
    periodType: "weekly",
    periodLabel: "2026-W44",
    auditId,
    now: new Date("2026-11-02T08:13:00Z"),
  });
  if (!data) throw new Error("no report data");
  return data;
}

async function uploadLogo(): Promise<string> {
  const { POST } = await import("@/app/api/branding/logo/route");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(LOGO)], { type: "image/png" }), "splice.png");
  const res = await POST(
    new Request("http://localhost/api/branding/logo", { method: "POST", body: form }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { logoUrl: string }).logoUrl;
}

describe("who can change report branding", () => {
  it("an owner saves the workspace branding; saving again updates the same row, and both are audit-trailed", async () => {
    signIn("owner");
    const first = await put({ agencyName: "Splice Marketing", contactLine: "02 9000 0000" });
    expect(first.status).toBe(200);
    const [row] = await workspaceRows();
    const second = await put({
      agencyName: "Splice Marketing",
      contactLine: "hello@splicemarketing.com.au",
    });
    expect(second.status).toBe(200);
    expect(second.body.changed).toEqual(["contactLine"]);
    const rows = await workspaceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(row.id);

    const trail = await sql<
      { action: string; resource_id: string; metadata: { changed: string[] } }[]
    >`
      SELECT action, resource_id, metadata FROM audit_trail
      WHERE organization_id = ${fx.orgId} ORDER BY created_at
    `;
    expect(trail.map((t) => [t.action, t.resource_id])).toEqual([
      ["report_branding_changed", "workspace"],
      ["report_branding_changed", "workspace"],
    ]);
    expect(trail[1].metadata.changed).toEqual(["contactLine"]);
  });

  it("an admin can save too", async () => {
    signIn("admin");
    expect(
      (await put({ agencyName: "Splice Marketing", contactLine: "02 9000 0000" })).status,
    ).toBe(200);
  });

  it("an analyst or a viewer gets 403 from every route that changes it, and nothing changes", async () => {
    const before = await workspaceRows();
    for (const role of ["analyst", "viewer"] as const) {
      signIn(role);
      expect((await put({ agencyName: "Hijacked" })).status, role).toBe(403);
      const { DELETE } = await import("@/app/api/report-branding/route");
      expect(
        (
          await DELETE(
            new Request(`http://localhost/api/report-branding?brandId=${BRAND_B}`, {
              method: "DELETE",
            }),
          )
        ).status,
      ).toBe(403);
      const { PATCH } = await import("@/app/api/agency/branding/route");
      const patched = await PATCH(
        new Request("http://localhost/api/agency/branding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agencyName: "Hijacked" }),
        }),
      );
      expect(patched.status, `${role} PATCH`).toBe(403);
      const { GET: preview } = await import("@/app/api/report-branding/preview/route");
      expect(
        (await preview(new Request("http://localhost/api/report-branding/preview"))).status,
      ).toBe(403);
    }
    expect(await workspaceRows()).toEqual(before);
  });

  it("the old /api/agency/branding PATCH, for an owner, saves in place as well", async () => {
    signIn("owner");
    const { PATCH } = await import("@/app/api/agency/branding/route");
    const res = await PATCH(
      new Request("http://localhost/api/agency/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyName: "Splice Marketing", contactLine: "02 9000 0000" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await workspaceRows()).toHaveLength(1);
  });

  it("a logo must be this workspace's own upload, or the one already saved", async () => {
    signIn("owner");
    for (const logoUrl of [
      "https://example.com/logo.png",
      `/api/branding/logo/${randomUUID()}/${randomUUID()}.png`,
    ]) {
      expect((await put({ agencyName: "Splice Marketing", logoUrl })).body.error).toBe(
        "logoUrl: upload the logo first",
      );
    }
  });
});

describe("one workspace-wide row per workspace", () => {
  it("the partial unique index stops a second one", async () => {
    await expect(
      sql`INSERT INTO agency_brand_assets (organization_id, brand_id, agency_name) VALUES (${fx.orgId}, NULL, 'Second')`,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("before the fix: readers take the newest row and a save updates it; the production fix keeps the newest; its rollback puts the rest back", async () => {
    // Production before 0114: no index, three saves' worth of rows.
    await sql`DROP INDEX agency_brand_assets_one_workspace_row`;
    await sql`DELETE FROM agency_brand_assets WHERE organization_id = ${fx.orgId} AND brand_id IS NULL`;
    for (const [name, daysAgo] of [
      ["First save", 3],
      ["Second save", 2],
      ["Third save", 1],
    ] as const) {
      await sql`
        INSERT INTO agency_brand_assets (organization_id, brand_id, agency_name, updated_at)
        VALUES (${fx.orgId}, NULL, ${name}, now() - make_interval(days => ${daysAgo}))
      `;
    }
    const [newest] = await workspaceRows();
    expect(newest.agency_name).toBe("Third save");

    expect((await reportAgency(fx.brandId, fx.audits[39])).agency.name).toBe("Third save");
    signIn("owner");
    const { GET } = await import("@/app/api/agency/branding/route");
    const got = (await (await GET()).json()) as { branding: { agencyName: string } };
    expect(got.branding.agencyName).toBe("Third save");

    expect((await put({ agencyName: "Saved in place" })).status).toBe(200);
    const afterSave = await workspaceRows();
    expect(afterSave).toHaveLength(3);
    expect(afterSave[0]).toMatchObject({ id: newest.id, agency_name: "Saved in place" });

    // The production fix, as written.
    const [backup] = (await sql.unsafe(PROD_FIX("run1-backup")).simple()).at(-1) as Array<
      Record<string, unknown>
    >;
    expect(Number(backup.backup_rows)).toBe(Number(backup.workspace_rows));
    expect(Number(backup.rows_run2_will_remove)).toBeGreaterThanOrEqual(2);
    const [applied] = (await sql.unsafe(PROD_FIX("run2-apply")).simple()).at(-1) as Array<
      Record<string, unknown>
    >;
    expect(applied).toMatchObject({ workspaces_with_duplicates: "0", index_present: true });
    expect(Number(applied.rows_removed)).toBe(Number(backup.rows_run2_will_remove));
    expect(await workspaceRows()).toEqual([afterSave[0]]);
    const checks = (await sql.unsafe(PROD_FIX("run3-post-check"))) as unknown as Array<{
      check_name: string;
      result: string;
    }>;
    expect(checks.map((c) => [c.check_name, c.result]).filter(([, r]) => r !== "PASS")).toEqual([]);
    expect(checks).toHaveLength(5);

    // The rollback (before run4) restores the deleted rows and drops the index.
    const [rolledBack] = (await sql.unsafe(PROD_FIX("rollback")).simple()).at(-1) as Array<
      Record<string, unknown>
    >;
    expect(rolledBack).toMatchObject({ index_present: false, missing_backup_rows: "0" });
    expect(await workspaceRows()).toHaveLength(3);

    // Applied again, then the backup dropped.
    await sql.unsafe(PROD_FIX("run2-apply")).simple();
    expect(await workspaceRows()).toHaveLength(1);
    await sql.unsafe(PROD_FIX("run4-drop-backup")).simple();
    const [gone] = await sql<{ present: boolean }[]>`
      SELECT to_regclass('public._backup_0114_agency_brand_assets') IS NOT NULL AS present
    `;
    expect(gone.present).toBe(false);
  });
});

describe("what the report PDF prints", () => {
  it("the saved agency name and uploaded logo are on the rendered cover", async () => {
    signIn("owner");
    const logoUrl = await uploadLogo();
    expect(
      (await put({ agencyName: "Splice Marketing", logoUrl, contactLine: "02 9000 0000" })).status,
    ).toBe(200);
    const data = await reportAgency(fx.brandId, fx.audits[39]);
    expect(data.agency).toMatchObject({ name: "Splice Marketing", logoUrl });

    const { loadAgencyLogo } = await import("@/lib/reports/agency-logo-loader");
    const logo = await loadAgencyLogo(logoUrl);
    expect(logo?.format).toBe("png");
    expect(logo?.data.equals(LOGO)).toBe(true);

    const { buildReportPdf, ReportDocument } = await import("@/lib/communication/pdf-builder");
    const cover = collectPdfPages(<ReportDocument data={data} logo={logo} />)[0].join("\n");
    expect(cover).toContain("Splice Marketing");
    expect(cover).toContain("Powered by");
    const pdf = await buildReportPdf(data);
    const raw = pdf.toString("latin1");
    expect(raw).toMatch(/\/Subtype\s*\/Image/);
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, "report-branding-cover.pdf"), pdf);
    }
  }, 120_000);

  it("a brand's override wins for that brand only, field by field", async () => {
    signIn("owner");
    expect(
      (await put({ brandId: fx.brandId, agencyName: "Splice Digital", logoUrl: null })).status,
    ).toBe(200);
    const workspaceLogo = (await reportAgency(BRAND_B, AUDIT_B)).agency.logoUrl;
    const a = await reportAgency(fx.brandId, fx.audits[39]);
    const b = await reportAgency(BRAND_B, AUDIT_B);
    expect(a.agency.name).toBe("Splice Digital");
    expect(a.agency.logoUrl).toBe(workspaceLogo);
    expect(a.agency.contactLine).toBe("02 9000 0000");
    expect(b.agency.name).toBe("Splice Marketing");

    const { DELETE } = await import("@/app/api/report-branding/route");
    const res = await DELETE(
      new Request(`http://localhost/api/report-branding?brandId=${fx.brandId}`, {
        method: "DELETE",
      }),
    );
    expect(await res.json()).toEqual({ removed: 1 });
    expect((await reportAgency(fx.brandId, fx.audits[39])).agency.name).toBe("Splice Marketing");
  });

  it("a brand's form saved with nothing in it adds no row; emptying an override removes it, audit-trailed", async () => {
    signIn("owner");
    const brandRows = () => sql`
      SELECT id FROM agency_brand_assets
      WHERE organization_id = ${fx.orgId} AND brand_id = ${BRAND_B}
    `;
    const nothing = {
      brandId: BRAND_B,
      agencyName: "",
      logoUrl: null,
      footerText: "",
      contactLine: "",
    };
    expect((await put(nothing)).status).toBe(200);
    expect(await brandRows()).toHaveLength(0);

    expect((await put({ brandId: BRAND_B, agencyName: "Splice Digital" })).status).toBe(200);
    expect(await brandRows()).toHaveLength(1);

    const emptied = await put(nothing);
    expect(emptied.status).toBe(200);
    expect(emptied.body.saved).toMatchObject({
      brandId: BRAND_B,
      agencyName: null,
      logoUrl: null,
      footerText: null,
      contactLine: null,
    });
    expect(await brandRows()).toHaveLength(0);
    const [last] = await sql<{ metadata: Record<string, unknown> }[]>`
      SELECT metadata FROM audit_trail
      WHERE organization_id = ${fx.orgId} AND resource_id = ${BRAND_B}
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(last.metadata).toMatchObject({ scope: "brand", brandId: BRAND_B, removed: true });
    expect((await reportAgency(BRAND_B, AUDIT_B)).agency.name).toBe("Splice Marketing");
  });

  it("the preview is a PDF of the report's own top bar and footer", async () => {
    signIn("owner");
    const { GET } = await import("@/app/api/report-branding/preview/route");
    const res = await GET(
      new Request(
        "http://localhost/api/report-branding/preview?agencyName=Splice%20Marketing&footerText=Confidential&brandName=Omega%20Services",
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    const previewPdf = Buffer.from(await res.arrayBuffer());
    expect(previewPdf.toString("latin1", 0, 5)).toBe("%PDF-");
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, "report-branding-preview.pdf"), previewPdf);
    }

    const { BrandingPreviewDocument } = await import("@/lib/reports/pdf/report-document");
    const [page] = collectPdfPages(
      <BrandingPreviewDocument
        agency={{ name: "Splice Marketing", footerText: null, contactLine: "02 9000 0000" }}
        brandName="Omega Services"
        logo={null}
      />,
    );
    expect(page).toContain("Splice Marketing");
    expect(page).toContain("SP");
    expect(page).toContain(
      "Confidential · Prepared for Omega Services by Splice Marketing · 02 9000 0000",
    );
  }, 60_000);
});

describe("where it's found", () => {
  it("the reports page's hint: any member reads the agency name a brand's reports print", async () => {
    signIn("viewer");
    const { GET } = await import("@/app/api/report-branding/route");
    const res = await GET(new Request(`http://localhost/api/report-branding?brandId=${BRAND_B}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ agencyName: "Splice Marketing", canEdit: false });
    const other = await GET(
      new Request(`http://localhost/api/report-branding?brandId=${randomUUID()}`),
    );
    expect(other.status).toBe(404);
  });

  it("Settings -> Report branding: the form for an owner; a plain 'owners and admins' for a viewer", async () => {
    const Page = (await import("@/app/(auth)/settings/report-branding/page")).default;
    signIn("owner");
    const ownerHtml = renderToStaticMarkup(await Page());
    expect(ownerHtml).toContain("data-report-branding-form");
    expect(ownerHtml).toContain('value="Splice Marketing"');
    expect(ownerHtml).toContain("Sigma Plumbing");
    signIn("viewer");
    const viewerHtml = renderToStaticMarkup(await Page());
    expect(viewerHtml).toContain("Only owners and admins can change report branding");
    expect(viewerHtml).not.toContain("data-report-branding-form");
  });

  it("the old /agency/branding address opens it", async () => {
    const OldPage = (await import("@/app/(auth)/agency/branding/page")).default;
    OldPage();
    expect(navigation.redirect).toHaveBeenCalledWith("/settings/report-branding");
  });
});
