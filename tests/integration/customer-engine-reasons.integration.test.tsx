/**
 * S01C part 1 (LLD amendment 58): customers see only a plain reason for an engine that didn't answer. The real
 * Basic, Standard and Enhanced PDFs printed, under the over-time chart, "Audit #47 used 3 of 4 engines (Claude:
 * provider spend limit reached), so it's shown but not compared": our provider account's state, told to the client.
 *
 * Two invented businesses seeded as real audits (tests/helpers/report-seeds.ts), with Claude's calls stored as the
 * spend-limit refusal ("400 You have reached your specified API usage limits."):
 * - Bluegum Home Services with an earlier audit, #47, in which Claude answered nothing: the trend point the real
 *   reports printed;
 * - Ironstone Property Services, whose basis audit #55 Claude answered nothing: the summary, engines and findings.
 * Every customer surface is read as a customer gets it: the PDF in every tier and with report_v2 off, the audit page
 * and its running-audit data, the client portal, the audit-complete email, the org copy of the whole-engine failure
 * email and the JSON export. None of them may carry the operator's words. The operator copy of the email keeps them.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BLUEGUM,
  IRONSTONE,
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

const current = vi.hoisted(() => ({ orgId: "" }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ organizationId: current.orgId })),
}));
const router = vi.hoisted(() => ({ refresh: () => {}, push: () => {}, back: () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock("@/lib/reports/enhanced-check-runners", () => ({
  // The seeded checks are all within their windows, so an Enhanced report re-runs nothing.
  enhancedRunners: () => ({ site: async () => {}, youtube: async () => {} }),
}));
const resend = vi.hoisted(() => {
  const delivered: Array<{ to: string; subject: string; html: string; text: string }> = [];
  const send = vi.fn(
    async (payload: { to: string; subject: string; html: string; text: string }) => {
      delivered.push(payload);
      return { data: { id: `em_${delivered.length}` }, error: null, headers: null };
    },
  );
  return { delivered, send };
});
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resend.send };
  },
}));

/**
 * The operator's words amendment 58 keeps from customers: the prompt's list, the provider's own message, and HTTP
 * status codes as a failure carries them ("HTTP 400", "status 429", "400 invalid_request_error", "(other, HTTP 400)").
 * A bare number isn't one: the PDF keeps "the first 500 characters" of an answer, and an email's CSS has
 * "font-weight:400".
 */
const INTERNAL: RegExp[] = [
  /spend limit/i,
  /quota/i,
  /credit/i,
  /billing/i,
  /rate limit/i,
  /API key/i,
  /API usage limits/i,
  /\bHTTP\s?[45]\d{2}\b/i,
  /\b(?:status|code)\s*[45]\d{2}\b/i,
  /\b[45]\d{2}\s+(?:[a-z_]+_error|You have|Too Many|Bad Request|Unauthorized|Forbidden|Payment)/i,
];
/** Each operator word found, with the text around it, so a failure says where it is. */
const internalWords = (text: string) =>
  INTERNAL.flatMap((re) => {
    const m = re.exec(text);
    return m
      ? [`${re}: …${text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60)}…`]
      : [];
  });

/** Bluegum with an earlier audit whose Claude calls were all refused by the spend limit, as the real #47's were. */
const BLUEGUM_47: SeedSpec = {
  ...BLUEGUM,
  audits: [
    {
      number: 47,
      completedAt: "2026-11-06T03:00:00.000Z",
      failedEngines: ["claude"],
      mentions: { chatgpt: [1], gemini: [], perplexity: [2] },
      directories: { "yellowpages.com.au": 12, "hipages.com.au": 6 },
    },
    ...BLUEGUM.audits,
  ],
};
const TREND_NOTE =
  "Audit #47 used 3 of 4 engines (Claude didn't answer: a problem on our side), so it's shown but not compared.";
const NOTE =
  "Based on 3 of 4 engines. Claude returned an error for every question: a problem on our side.";
const OPERATOR_LABEL =
  "Provider spend limit reached (a monthly limit set in the provider's console)";
const OPERATOR_CHECK =
  "Raise the monthly spend limit in the provider's console, or wait for it to reset.";

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let bluegum: SeededReportBrand;
let ironstone: SeededReportBrand;
const reports = new Map<string, Record<ReportVersion, RenderedReport>>();
const TOKEN = `portal-s01c-${randomUUID()}`;
const OWNER = `owner-${randomUUID().slice(0, 8)}@s01c-reasons.example.com.au`;

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  bluegum = await seedReportBrand(sql, BLUEGUM_47);
  ironstone = await seedReportBrand(sql, IRONSTONE);
  for (const seed of [bluegum, ironstone]) {
    const byVersion: Partial<Record<ReportVersion, RenderedReport>> = {};
    for (const v of REPORT_VERSIONS) byVersion[v] = await renderSeededReport(sql, seed, v);
    reports.set(seed.spec.key, byVersion as Record<ReportVersion, RenderedReport>);
  }
  // Ironstone's portal link and an owner to email.
  await sql`
    INSERT INTO client_portal_invites (organization_id, brand_id, invite_token)
    VALUES (${ironstone.orgId}, ${ironstone.brandId}, ${TOKEN})`;
  await sql`
    INSERT INTO users (clerk_user_id, organization_id, email, name, role)
    VALUES (${`s01c-${ironstone.orgId}`}, ${ironstone.orgId}, ${OWNER}, 'Owner', 'owner')`;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    SELECT ${ironstone.orgId}, id, 'owner', now(), now(), true FROM users
    WHERE clerk_user_id = ${`s01c-${ironstone.orgId}`}`;
}, 600_000);

afterAll(async () => {
  if (ironstone) {
    await sql`DELETE FROM client_portal_invites WHERE organization_id = ${ironstone.orgId}`;
    await sql`DELETE FROM audit_exports WHERE organization_id = ${ironstone.orgId}`;
    await sql`DELETE FROM org_members WHERE organization_id = ${ironstone.orgId}`;
    await sql`DELETE FROM users WHERE organization_id = ${ironstone.orgId}`;
  }
  for (const seed of [bluegum, ironstone]) await seed?.cleanup();
  await sql.end();
});

const report = (seed: SeededReportBrand, v: ReportVersion) => {
  const r = reports.get(seed.spec.key)?.[v];
  if (!r) throw new Error(`${seed.spec.key} ${v} wasn't rendered`);
  return r;
};

describe.each(
  REPORT_VERSIONS.map((v) => [v === "today" ? "report_v2 off" : v, v] as const),
)("the PDF, %s", (_name, v) => {
  it("Bluegum: the over-time chart's note gives the plain reason for #47", () => {
    const r = report(bluegum, v);
    expect(r.text).toContain(TREND_NOTE);
    expect(internalWords(r.text)).toEqual([]);
  });

  it("Ironstone: the basis audit's summary, engines page and findings give the plain reason", () => {
    const r = report(ironstone, v);
    expect(r.text).toContain("(a problem on our side)");
    expect(r.text).toContain("Didn't answer: a problem on our side");
    expect(internalWords(r.text)).toEqual([]);
  });
});

describe("the audit page", () => {
  it("Ironstone #55: the banner says why in plain words, and nothing on the page names the provider's limit", async () => {
    current.orgId = ironstone.orgId;
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const html = renderToStaticMarkup(
      await AuditPage({
        params: Promise.resolve({ auditId: ironstone.basisAuditId }),
        searchParams: Promise.resolve({}),
      }),
    );
    const banner = html.match(
      /<div role="alert" data-engine-total-failure="[^"]*"[\s\S]*?<\/p><\/div><\/div>/,
    )?.[0];
    expect(banner).toBeDefined();
    expect(banner).toContain("Why: a problem on our side.");
    expect(internalWords(banner ?? "")).toEqual([]);
    expect(html).not.toContain(OPERATOR_LABEL);
    expect(html).not.toContain("provider&#x27;s console");
    expect(html).not.toContain("What to check");
  });

  it("the running-audit data names no operator reason", async () => {
    current.orgId = ironstone.orgId;
    const { GET } = await import("@/app/api/audits/[auditId]/route");
    const res = await GET(new Request(`http://localhost/api/audits/${ironstone.basisAuditId}`), {
      params: Promise.resolve({ auditId: ironstone.basisAuditId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      engineProgress: Array<{ engine: string; failureReason: string | null }>;
    };
    expect(body.engineProgress.find((e) => e.engine === "claude")?.failureReason).toBe(
      "A problem on our side",
    );
    expect(internalWords(JSON.stringify(body.engineProgress))).toEqual([]);
  });
});

describe("the client portal", () => {
  it("the coverage note under Visibility gives the plain reason", async () => {
    const Page = (await import("@/app/client-portal/[inviteToken]/page")).default;
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ inviteToken: TOKEN }) }),
    );
    const note = html.match(/<p data-engine-coverage="[^"]*"[^>]*>([^<]*)<\/p>/)?.[1];
    expect(note?.replace(/&#x27;/g, "'")).toBe(NOTE);
    expect(html).not.toContain(OPERATOR_LABEL);
    expect(internalWords(note ?? "")).toEqual([]);
  });
});

describe("emails", () => {
  type Handler = (ctx: {
    event: { data: { auditId: string } };
    step: { run: (name: string, fn: () => unknown) => unknown };
  }) => Promise<unknown>;

  it("the audit-complete email: the plain reason, no operator steps", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "Vunnara <audits@vunnara.com.au>");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.vunnara.com.au");
    try {
      const before = resend.delivered.length;
      const { sendAuditCompleteEmail } = await import(
        "@/inngest/functions/send-audit-complete-email"
      );
      await (sendAuditCompleteEmail as unknown as { fn: Handler }).fn({
        event: { data: { auditId: ironstone.basisAuditId } },
        step: { run: (_name, fn) => fn() },
      });
      const [email] = resend.delivered.slice(before);
      expect(email.to).toBe(OWNER);
      expect(email.text).toContain(NOTE);
      expect(email.text).not.toContain("What to check");
      expect(internalWords(`${email.subject}\n${email.text}`)).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("the whole-engine failure email: the org copy is plain; the operator copy keeps the detail", async () => {
    const { findEngineTotalFailures } = await import("@/lib/audit/engine-total-failure-alert");
    const { engineTotalFailureEmail } = await import(
      "@/lib/email/templates/alerts/engine-total-failure"
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const alert = await findEngineTotalFailures(ironstone.basisAuditId);
    warn.mockRestore();
    if (!alert) throw new Error("no whole-engine failure found");
    const org = engineTotalFailureEmail({
      ...alert,
      audience: "org",
      auditUrl: "https://x.test/a",
    });
    const operator = engineTotalFailureEmail({
      ...alert,
      audience: "operator",
      auditUrl: "https://x.test/a",
    });
    expect(org.text).toContain("A problem on our side");
    expect(internalWords(`${org.subject}\n${org.text}\n${org.html}`)).toEqual([]);
    expect(operator.text).toContain(`${OPERATOR_LABEL} (other, HTTP 400)`);
    expect(operator.text).toContain(OPERATOR_CHECK);
  });
});

describe("exports", () => {
  it("the JSON export's coverage and metadata name no operator reason", async () => {
    current.orgId = ironstone.orgId;
    const { GET } = await import("@/app/api/audits/[auditId]/export/route");
    const res = await GET(
      new Request(`http://localhost/api/audits/${ironstone.basisAuditId}/export?format=json`),
      { params: Promise.resolve({ auditId: ironstone.basisAuditId }) },
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain(OPERATOR_LABEL);
    expect(body).not.toContain("specified API usage limits");
  });
});
