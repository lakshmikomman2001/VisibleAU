/**
 * S01C part 5a (LLD amendment 64): a report PDF is named "{Brand} – AI Visibility Report ({Tier name}) – Week {w}
 * {yyyy}.pdf" (no tier for a report made with report_v2 off) wherever it leaves the app, never its storage id (the
 * real Basic report downloaded as "5573cd17-….pdf"):
 * - the reports page's download (GET /api/brands/:id/reports and /reports/:reportId hand out the link);
 * - the local storage driver's file route, which sends the name through Content-Disposition (an ASCII fallback and
 *   filename*);
 * - the client portal's download link;
 * - the scheduled-report email's link;
 * - a Supabase signed link (production), which asks Storage to download the file under the name.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reportContentDisposition } from "@/lib/communication/report-file-name";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const USER = randomUUID();
const who = vi.hoisted(() => ({ orgId: "" }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: USER,
    organizationId: who.orgId,
    email: "owner@report-names.example.com.au",
    name: "Owner",
    role: "owner",
    organization: { id: who.orgId, name: "Splice Marketing", region: "au", metadata: {} },
  })),
}));
// getStorage's require() of the local driver isn't resolvable under vitest; the app's own adapter, as other tests use it.
vi.mock("@/lib/storage", async () => {
  const { LocalStorageAdapter } = await import("@/lib/storage/local-adapter");
  return { getStorage: () => new LocalStorageAdapter() };
});
const signed = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async (...args: unknown[]) => {
          signed.calls.push(args);
          return { data: { signedUrl: "https://storage.example.test/signed" }, error: null };
        },
      }),
    },
  }),
}));
const emails = vi.hoisted(() => ({ links: [] as Array<string | null> }));
vi.mock("@/lib/email/templates/scheduled-report", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email/templates/scheduled-report")>();
  return {
    ...real,
    scheduledReportEmail: (input: Parameters<typeof real.scheduledReportEmail>[0]) => {
      emails.links.push((input as { pdfUrl?: string | null }).pdfUrl ?? null);
      return real.scheduledReportEmail(input);
    },
  };
});
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmailOrThrow: vi.fn(async () => ({ ok: true, id: "em_1" })),
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
const STORE = mkdtempSync(join(tmpdir(), "s01c-report-names-"));
let fx: ReportFixture;
const ids = { enhanced: randomUUID(), today: randomUUID() };
const SCHEDULE = randomUUID();
const ENHANCED_NAME = "Waratah Home Services – AI Visibility Report (Enhanced) – Week 47 2026.pdf";
const TODAY_NAME = "Waratah Home Services – AI Visibility Report – Week 46 2026.pdf";

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  process.env.STORAGE_DRIVER = "local";
  process.env.STORAGE_LOCAL_DIR = STORE;
  fx = await seedReportFixture(sql, {
    brandName: "Waratah Home Services",
    agencyName: "Splice Marketing",
    tier: "agency",
    audits: [{ number: 54, completedAt: "2026-11-20T03:00:00.000Z", mentions: { chatgpt: [1] } }],
  });
  who.orgId = fx.orgId;
  await sql`INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${USER}, ${`rn-${USER}`}, ${fx.orgId}, ${`owner-${USER.slice(0, 8)}@report-names.example.com.au`}, 'Owner', 'owner')`;
  await sql`INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${fx.orgId}, ${USER}, 'owner', now(), now(), true)`;
  const insert = (
    id: string,
    period: string,
    tier: string,
    snapshot: unknown,
    createdAt: string,
  ) => sql`
    INSERT INTO generated_reports (id, brand_id, organization_id, audit_id, report_type, period_label, narrative_text,
      headline, report_tier, contents_snapshot, pdf_url, created_at)
    VALUES (${id}, ${fx.brandId}, ${fx.orgId}, ${fx.audits[54]}, 'weekly', ${period}, 'n', 'h', ${tier},
      ${snapshot === null ? null : sql.json(JSON.parse(JSON.stringify(snapshot)))}, ${`${fx.orgId}/${id}.pdf`},
      ${createdAt})`;
  await insert(ids.today, "2026-W46", "basic", null, "2026-11-14T00:00:00Z");
  await insert(
    ids.enhanced,
    "2026-W47",
    "enhanced",
    { schema: 1, tierName: "Enhanced" },
    "2026-11-21T00:00:00Z",
  );
  mkdirSync(join(STORE, fx.orgId), { recursive: true });
  for (const id of Object.values(ids))
    writeFileSync(join(STORE, fx.orgId, `${id}.pdf`), "%PDF-1.4 test");
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM report_delivery_schedules WHERE id = ${SCHEDULE}`;
  for (const table of ["org_feature_flags", "org_members"])
    await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM users WHERE id = ${USER}`;
  await fx.cleanup();
  await sql.end();
  rmSync(STORE, { recursive: true, force: true });
});

const nameIn = (link: string) => new URL(link, "http://localhost").searchParams.get("name");

async function download(link: string) {
  const { GET } = await import("@/app/api/reports/file/[...path]/route");
  const url = new URL(link, "http://localhost");
  const path = url.pathname.replace(/^\/api\/reports\/file\//, "").split("/");
  return GET(new Request(url), { params: Promise.resolve({ path }) });
}

describe("the reports page's download", () => {
  it("the list's links carry each report's name: its tier name, or none for a report made with report_v2 off", async () => {
    const { GET } = await import("@/app/api/brands/[brandId]/reports/route");
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ brandId: fx.brandId }),
    });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ id: string; pdfUrl: string }>;
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.pdfUrl]));
    expect(nameIn(byId[ids.enhanced])).toBe(ENHANCED_NAME);
    expect(nameIn(byId[ids.today])).toBe(TODAY_NAME);
  });

  it("the detail's link too", async () => {
    const { GET } = await import("@/app/api/brands/[brandId]/reports/[reportId]/route");
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ brandId: fx.brandId, reportId: ids.enhanced }),
    });
    const view = (await res.json()) as { pdfUrl: string };
    expect(nameIn(view.pdfUrl)).toBe(ENHANCED_NAME);
  });

  it("the file downloads under the name: an ASCII fallback with hyphens, and the UTF-8 name as filename*", async () => {
    const { GET } = await import("@/app/api/brands/[brandId]/reports/route");
    const rows = (await (
      await GET(new Request("http://x"), { params: Promise.resolve({ brandId: fx.brandId }) })
    ).json()) as Array<{ id: string; pdfUrl: string }>;
    const link = rows.find((r) => r.id === ids.enhanced)?.pdfUrl ?? "";
    const res = await download(link);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(reportContentDisposition(ENHANCED_NAME));
    expect(res.headers.get("content-disposition")).toContain(
      'filename="Waratah Home Services - AI Visibility Report (Enhanced) - Week 47 2026.pdf"',
    );
    expect(res.headers.get("content-disposition")).not.toContain(ids.enhanced);
  });
});

describe("the client portal's download", () => {
  it("each row's link carries the report's name", async () => {
    const { withRlsContext } = await import("@/db/client");
    const { loadPortalReports } = await import("@/lib/client-portal/portal-reports");
    const { getStorage } = await import("@/lib/storage");
    const rows = await withRlsContext(fx.orgId, (tx) =>
      loadPortalReports(tx, {
        organizationId: fx.orgId,
        brandId: fx.brandId,
        brandName: "Waratah Home Services",
        storage: getStorage(),
      }),
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.downloadUrl ?? ""]));
    expect(nameIn(byId[ids.enhanced])).toBe(ENHANCED_NAME);
    expect(nameIn(byId[ids.today])).toBe(TODAY_NAME);
  });
});

describe("the scheduled-report email's link", () => {
  it("downloads the newest report under its name", async () => {
    const now = new Date();
    await sql`
      INSERT INTO report_delivery_schedules (id, organization_id, brand_id, frequency, day_of_week, time_of_day, recipient_emails, is_active)
      VALUES (${SCHEDULE}, ${fx.orgId}, ${fx.brandId}, 'weekly', ${now.getUTCDay()},
        ${`${now.getUTCHours().toString().padStart(2, "0")}:00`}, ${sql.json(["client@report-names.example.com.au"])}, true)`;
    const { sendScheduledReports } = await import("@/inngest/functions/send-scheduled-reports");
    const step = {
      run: async (name: string, work: () => Promise<unknown>) =>
        name === "find-due-schedules" || name === `send-${SCHEDULE}` ? work() : undefined,
      sleep: async () => {},
      sendEvent: async () => ({ ids: [] }),
    };
    emails.links.length = 0;
    await (sendScheduledReports as unknown as { fn: (ctx: object) => Promise<unknown> }).fn({
      step,
      event: { data: {} },
    });
    const link = emails.links.find((l) => l?.includes(ids.enhanced));
    expect(link).toBeDefined();
    expect(nameIn(link ?? "")).toBe(ENHANCED_NAME);
  });
});

describe("a Supabase signed link (production)", () => {
  it("asks Storage to download the file under the name", async () => {
    const { SupabaseStorageAdapter } = await import("@/lib/storage/supabase-adapter");
    signed.calls.length = 0;
    await new SupabaseStorageAdapter("reports").getDownloadUrl("org/r.pdf", 600, ENHANCED_NAME);
    expect(signed.calls[0]).toEqual(["org/r.pdf", 600, { download: ENHANCED_NAME }]);
    await new SupabaseStorageAdapter("reports").getDownloadUrl("org/logo.png");
    expect(signed.calls[1]).toEqual(["org/logo.png", 604800, undefined]);
  });
});
