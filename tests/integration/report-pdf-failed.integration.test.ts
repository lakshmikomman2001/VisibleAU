/**
 * URGENT PDF reports (1 Nov), part 2 -- production's report PDF failed
 * ("Supabase Storage upload failed: fetch failed") and the report stayed
 * "Generating..." for good. With the storage host failing the way it did
 * (DNS, ENOTFOUND) through the real storage-js client and adapter:
 * - render-report-pdf records the failure on the report (storage
 *   unavailable), alerts the owners, admins and operators once per run,
 *   and fails the run with ENOTFOUND and no URL or key in its message;
 * - the reports API says "failed", not "generating";
 * - "Try again" (owner, admin or analyst) re-sends report/generated; a
 *   viewer gets 403;
 * - a scheduled report email whose PDF link can't be made says so, instead
 *   of leaving the PDF out without a word.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const resend = vi.hoisted(() => {
  const delivered: Array<{ to: string; subject: string; html: string; text: string }> = [];
  const idsByKey = new Map<string, string>();
  const send = vi.fn(
    async (
      payload: { to: string; subject: string; html: string; text: string },
      options?: { idempotencyKey?: string },
    ) => {
      const key = options?.idempotencyKey;
      if (key && idsByKey.has(key)) {
        return { data: { id: idsByKey.get(key) as string }, error: null, headers: null };
      }
      const id = `em_${delivered.length + 1}`;
      delivered.push(payload);
      if (key) idsByKey.set(key, id);
      return { data: { id }, error: null, headers: null };
    },
  );
  return { delivered, idsByKey, send };
});
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resend.send };
  },
}));
// Building the PDF isn't what's tested here, nor gathering its figures
// (the report has no audit behind it); uploading it is.
vi.mock("@/lib/communication/pdf-builder", () => ({
  buildReportPdf: vi.fn(async () => Buffer.from("%PDF-1.4 test report")),
}));
vi.mock("@/lib/reports/report-data", () => ({
  buildReportData: vi.fn(async () => ({ organizationId: "test" })),
}));
// lib/storage/index.ts loads the adapter with require(), which Next's bundler
// handles and vitest's ESM loader can't: the same, real SupabaseStorageAdapter,
// imported the ESM way.
vi.mock("@/lib/storage", async () => {
  const { SupabaseStorageAdapter } = await import("@/lib/storage/supabase-adapter");
  return { getStorage: () => new SupabaseStorageAdapter() };
});
const currentUser = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser.value),
}));

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const REPORT_ID = randomUUID();
const EMAILED_REPORT_ID = randomUUID();
const SCHEDULE_ID = randomUUID();
const DOMAIN = "pdf-failed.example.com.au";
const PEOPLE = {
  owner: { id: randomUUID(), email: `owner@${DOMAIN}`, role: "owner" },
  analyst: { id: randomUUID(), email: `analyst@${DOMAIN}`, role: "analyst" },
  viewer: { id: randomUUID(), email: `viewer@${DOMAIN}`, role: "viewer" },
};
const OPERATOR = `ops@${DOMAIN}`;
const RECIPIENT = `reports@${DOMAIN}`;
const REF = "abcdefghijklmnopqrst";
const HOST = `${REF}.supabase.co`;
/** A made-up JWT-shaped string for this test's made-up project; never a real key. */
const FAKE_KEY = [
  { alg: "HS256", typ: "JWT" },
  { role: "service_role", ref: REF, exp: 2_000_000_000 },
]
  .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
  .concat("c2lnbmF0dXJlLW5vdC1yZWFs")
  .join(".");

let client: ReturnType<typeof postgres>;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`pdff-${ORG_ID}`}, 'Splice Marketing (test)', ${`pdff-${ORG_ID}`})
  `;
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test', 'agency_pro', 'monthly', 'active')
  `;
  for (const p of Object.values(PEOPLE)) {
    await client`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${p.id}, ${`pdff-${p.id}`}, ${ORG_ID}, ${p.email}, 'Test', ${p.role})
    `;
    await client`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${ORG_ID}, ${p.id}, ${p.role}, now() + interval '7 days', now(), true)
    `;
  }
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Omega Services', 'omega-pdff.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  // The report that's been "Generating..." (no PDF yet), and an older one that has a PDF.
  await client`
    INSERT INTO generated_reports (id, brand_id, organization_id, report_type, period_label, narrative_text, headline)
    VALUES (${REPORT_ID}, ${BRAND_ID}, ${ORG_ID}, 'weekly', '2026-W44', 'Narrative.', 'AI Visibility Report')
  `;
  await client`
    INSERT INTO generated_reports (id, brand_id, organization_id, report_type, period_label, narrative_text, headline, pdf_url, created_at)
    VALUES (${EMAILED_REPORT_ID}, ${BRAND_ID}, ${ORG_ID}, 'weekly', '2026-W43', 'Narrative.', 'AI Visibility Report',
      ${`${ORG_ID}/${EMAILED_REPORT_ID}.pdf`}, now() - interval '7 days')
  `;
});

afterAll(async () => {
  await client`DELETE FROM report_delivery_schedules WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM generated_reports WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "Vunnara <audits@vunnara.com.au>");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.vunnara.com.au");
  vi.stubEnv("PLATFORM_ADMIN_EMAILS", OPERATOR);
  vi.stubEnv("STORAGE_DRIVER", "supabase");
  vi.stubEnv("SUPABASE_URL", `https://${HOST}`);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", FAKE_KEY);
  // The storage host doesn't resolve, as production's didn't on 1 Nov;
  // anything else goes through.
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === HOST) {
        const cause = Object.assign(new Error(`getaddrinfo ENOTFOUND ${HOST}`), {
          code: "ENOTFOUND",
        });
        return Promise.reject(new TypeError("fetch failed", { cause }));
      }
      return realFetch(input, init);
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type RenderHandler = (ctx: {
  event: { id: string; data: { reportId: string; organizationId: string; brandId: string } };
  step: { run: (name: string, fn: () => unknown) => unknown };
}) => Promise<unknown>;

async function renderPdf(eventId: string): Promise<Error | null> {
  const { renderReportPdf } = await import("@/inngest/functions/render-report-pdf");
  return (renderReportPdf as unknown as { fn: RenderHandler })
    .fn({
      event: {
        id: eventId,
        data: { reportId: REPORT_ID, organizationId: ORG_ID, brandId: BRAND_ID },
      },
      step: { run: (_name, fn) => fn() },
    })
    .then(() => null)
    .catch((e: Error) => e);
}

async function reasonInDb(): Promise<{
  pdf_failure_reason: string | null;
  pdf_url: string | null;
}> {
  const [row] = await client<{ pdf_failure_reason: string | null; pdf_url: string | null }[]>`
    SELECT pdf_failure_reason, pdf_url FROM generated_reports WHERE id = ${REPORT_ID}
  `;
  return row;
}

function signIn(who: keyof typeof PEOPLE) {
  const p = PEOPLE[who];
  currentUser.value = {
    id: p.id,
    organizationId: ORG_ID,
    role: p.role,
    email: p.email,
    organization: { id: ORG_ID, name: "Splice Marketing (test)" },
  };
}

describe("a storage failure while making the PDF (1 Nov, part 2)", () => {
  it("records 'storage unavailable' on the report, and fails the run with ENOTFOUND and no URL or key", async () => {
    const err = await renderPdf("evt-render-1");
    expect(err?.name).toBe("NonRetriableError");
    expect(err?.message).toMatch(
      /^PDF not created \(storage_unavailable\): Supabase Storage upload failed: fetch failed \(cause: ENOTFOUND, Error: getaddrinfo ENOTFOUND /,
    );
    expect(err?.message).not.toMatch(/https?:\/\//);
    expect(err?.message).not.toContain(FAKE_KEY);
    expect(await reasonInDb()).toEqual({
      pdf_failure_reason: "storage_unavailable",
      pdf_url: null,
    });
  });

  it("alerts the owner and the operator once per run -- not the analyst or the viewer -- with no raw message", async () => {
    const forThisReport = resend.delivered.filter((m) => m.text.includes("2026-W44"));
    expect(forThisReport.map((m) => m.to).sort()).toEqual([OPERATOR, PEOPLE.owner.email].sort());
    const ops = forThisReport.find((m) => m.to === OPERATOR);
    expect(ops?.subject).toBe("[ops] [Omega Services] A report PDF couldn't be created");
    expect(ops?.text).toContain("file storage couldn't be reached");
    for (const m of forThisReport) {
      expect(m.text).not.toContain("ENOTFOUND");
      expect(m.text).not.toContain(HOST);
      expect(m.text).not.toContain(FAKE_KEY);
    }

    // Inngest replaying the same run sends nothing new.
    const before = resend.delivered.length;
    await renderPdf("evt-render-1");
    expect(resend.delivered.length).toBe(before);
  });

  it("the reports API says failed, with its reason -- not generating", async () => {
    signIn("viewer");
    const list = await import("@/app/api/brands/[brandId]/reports/route");
    const res = await list.GET(new Request("http://t/x"), {
      params: Promise.resolve({ brandId: BRAND_ID }),
    });
    const rows = (await res.json()) as Array<{
      id: string;
      status: string;
      pdfFailureReason: string | null;
    }>;
    const failed = rows.find((r) => r.id === REPORT_ID);
    expect(failed?.status).toBe("failed");
    expect(failed?.pdfFailureReason).toBe("storage_unavailable");

    const detail = await import("@/app/api/brands/[brandId]/reports/[reportId]/route");
    const one = await detail.GET(new Request("http://t/x"), {
      params: Promise.resolve({ brandId: BRAND_ID, reportId: REPORT_ID }),
    });
    expect(((await one.json()) as { status: string }).status).toBe("failed");
  });

  it("a report WITH a PDF whose link can't be signed stays ready, marked unavailable -- not 'Generating...'", async () => {
    signIn("viewer");
    const list = await import("@/app/api/brands/[brandId]/reports/route");
    const res = await list.GET(new Request("http://t/x"), {
      params: Promise.resolve({ brandId: BRAND_ID }),
    });
    const rows = (await res.json()) as Array<{
      id: string;
      status: string;
      pdfUrl: string | null;
      pdfLinkUnavailable: boolean;
    }>;
    const withPdf = rows.find((r) => r.id === EMAILED_REPORT_ID);
    expect(withPdf).toMatchObject({ status: "ready", pdfUrl: null, pdfLinkUnavailable: true });
  });
});

describe("'Try again' (1 Nov, part 2)", () => {
  async function retry() {
    const { POST } = await import("@/app/api/brands/[brandId]/reports/[reportId]/retry-pdf/route");
    return POST(new Request("http://t/x", { method: "POST" }), {
      params: Promise.resolve({ brandId: BRAND_ID, reportId: REPORT_ID }),
    });
  }

  it("a viewer gets 403, and nothing changes", async () => {
    const { inngest } = await import("@/lib/inngest/client");
    const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: ["x"] });
    signIn("viewer");
    const res = await retry();
    expect(res.status).toBe(403);
    expect(send).not.toHaveBeenCalled();
    expect((await reasonInDb()).pdf_failure_reason).toBe("storage_unavailable");
  });

  it("an analyst: 202, the reason is cleared, and report/generated is sent again for this report", async () => {
    const { inngest } = await import("@/lib/inngest/client");
    const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: ["x"] });
    signIn("analyst");
    const res = await retry();
    expect(res.status).toBe(202);
    expect(send).toHaveBeenCalledWith({
      name: "report/generated",
      data: { organizationId: ORG_ID, brandId: BRAND_ID, reportId: REPORT_ID },
    });
    expect((await reasonInDb()).pdf_failure_reason).toBeNull();
  });

  it("while it's generating again: 409, no second render", async () => {
    const { inngest } = await import("@/lib/inngest/client");
    const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: ["x"] });
    signIn("owner");
    const res = await retry();
    expect(res.status).toBe(409);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("a scheduled report email when the PDF's link can't be made (1 Nov)", () => {
  it("says so (and logs it), instead of leaving the PDF out without a word", async () => {
    const now = new Date();
    await client`
      INSERT INTO report_delivery_schedules (id, organization_id, brand_id, frequency, day_of_week, time_of_day, recipient_emails, is_active)
      VALUES (${SCHEDULE_ID}, ${ORG_ID}, ${BRAND_ID}, 'weekly', ${now.getUTCDay()},
        ${`${now.getUTCHours().toString().padStart(2, "0")}:00`}, ${client.json([RECIPIENT])}, true)
    `;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { sendScheduledReports } = await import("@/inngest/functions/send-scheduled-reports");
    type Handler = (ctx: {
      step: { run: (name: string, fn: () => unknown) => unknown };
    }) => Promise<unknown>;
    await (sendScheduledReports as unknown as { fn: Handler }).fn({
      step: {
        // Only this test's schedule: others in the test DB may be due too.
        run: async (name, fn) => {
          if (name === "find-due-schedules") {
            const due = (await fn()) as Array<{ id: string }>;
            return due.filter((s) => s.id === SCHEDULE_ID);
          }
          return name === `send-${SCHEDULE_ID}` ? fn() : undefined;
        },
      },
    });
    const email = resend.delivered.find((m) => m.to === RECIPIENT);
    expect(email?.text).toContain(
      "The PDF couldn't be linked in this email. Open the report in Vunnara to download it.",
    );
    expect(email?.text).not.toContain("Download the PDF report");
    const logged = warn.mock.calls.map((c) => String(c[0]));
    expect(logged.some((l) => l.includes("scheduled_report_pdf_link_unavailable"))).toBe(true);
    expect(logged.join(" ")).not.toContain(HOST);
  });
});
