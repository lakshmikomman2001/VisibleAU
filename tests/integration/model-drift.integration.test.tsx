/**
 * Sri's decision 6 (7 Nov) -- an audit a provider answered with a different model than the one asked for
 * (sonar-pro asked for, sonar answered) says so on the audit page and on the PDF report's method page, and
 * emails the org's owners and admins and the operator ([ops]) once. An audit whose models match -- a dated
 * snapshot is the same model -- gets no note and no email. Both runners: the Inngest function and the
 * inline runner's sendModelDriftAlert.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ReportDocument } from "@/lib/reports/pdf/report-document";
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

const DOMAIN = "model-drift.example.com.au";
const OWNER = `owner@${DOMAIN}`;
const ADMIN = `admin@${DOMAIN}`;
const ANALYST = `analyst@${DOMAIN}`;
const OPERATOR = `ops@${DOMAIN}`;
const NOTE = "Perplexity answered with sonar instead of sonar-pro (13 of 13 answers)";

let client: ReturnType<typeof postgres>;
let fx: ReportFixture;
const userIds: string[] = [];

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  fx = await seedReportFixture(client, {
    audits: [
      {
        // Perplexity asked for sonar-pro and answered with sonar; ChatGPT's dated snapshot is the same model.
        number: 41,
        completedAt: "2026-11-06T23:00:00.000Z",
        mentions: { chatgpt: [1], claude: [1], gemini: [], perplexity: [1] },
        methodologyVersion: 3,
        models: { perplexity: "sonar-pro" },
        answeredModels: { perplexity: "sonar", chatgpt: "gpt-4o-search-preview-2025-03-11" },
      },
      {
        number: 42,
        completedAt: "2026-11-07T01:00:00.000Z",
        mentions: { chatgpt: [1], claude: [1], gemini: [], perplexity: [1] },
        methodologyVersion: 3,
        models: { perplexity: "sonar-pro" },
        answeredModels: { perplexity: "sonar-pro", chatgpt: "gpt-4o-search-preview-2025-03-11" },
      },
    ],
  });
  session.organizationId = fx.orgId;
  for (const [email, role] of [
    [OWNER, "owner"],
    [ADMIN, "admin"],
    [ANALYST, "analyst"],
  ]) {
    const id = randomUUID();
    userIds.push(id);
    await client`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${id}, ${`drift-${id}`}, ${fx.orgId}, ${email}, 'Test', ${role})
    `;
  }
}, 120_000);

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await client`DELETE FROM users WHERE id = ANY(${userIds})`;
  await fx.cleanup();
  await client.end();
});

function productionEnv() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "Vunnara <audits@vunnara.com.au>");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.vunnara.com.au");
  vi.stubEnv("PLATFORM_ADMIN_EMAILS", OPERATOR);
}

async function auditPage(auditId: string): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  return renderToStaticMarkup(
    await AuditPage({ params: Promise.resolve({ auditId }), searchParams: Promise.resolve({}) }),
  );
}

async function reportText(auditId: string): Promise<{ drift: number; text: string }> {
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
    drift: data.modelDrift.length,
    text: collectPdfText(<ReportDocument data={data} />).join("\n"),
  };
}

type NotifyHandler = (ctx: {
  event: { data: { auditId: string } };
  step: { run: (name: string, fn: () => unknown) => unknown };
}) => Promise<{ sent: number; engines?: string[] }>;

async function runInngestFunction(auditId: string) {
  const { notifyModelDrift } = await import("@/inngest/functions/notify-model-drift");
  return (notifyModelDrift as unknown as { fn: NotifyHandler }).fn({
    event: { data: { auditId } },
    step: { run: (_name, fn) => fn() },
  });
}

describe("the audit page and the PDF say which model answered", () => {
  it("#41: the audit page's note names the model that answered and the one asked for", async () => {
    const html = await auditPage(fx.audits[41]);
    const note = html.match(/<p data-model-drift[^>]*>([\s\S]*?)<\/p>/)?.[1];
    expect(note).toBe(NOTE);
  }, 60_000);

  it("#41: the PDF's method page has the same note", async () => {
    const { drift, text } = await reportText(fx.audits[41]);
    expect(drift).toBe(1);
    expect(text).toContain("Model note");
    expect(text).toContain(NOTE);
  }, 60_000);

  it("#42 (the models match, a dated snapshot included): no note on either", async () => {
    expect(await auditPage(fx.audits[42])).not.toContain("data-model-drift");
    const { drift, text } = await reportText(fx.audits[42]);
    expect(drift).toBe(0);
    expect(text).not.toContain("Model note");
    // Methodology v2.2 (7 Nov), part 3: #42's own trend still names #41's drift -- shown, never compared.
    expect(
      text.replaceAll(`Audit #41: ${NOTE}, so it's shown but not compared.`, ""),
    ).not.toContain("answered with");
    expect(text).toContain(`Audit #41: ${NOTE}, so it's shown but not compared.`);
  }, 60_000);
});

describe("one alert per audit, to owners, admins and [ops]", () => {
  it("#41: owner, admin and the operator, once -- never the analyst", async () => {
    productionEnv();
    const before = resend.delivered.length;
    const result = await runInngestFunction(fx.audits[41]);

    expect(result).toEqual({ sent: 3, engines: ["perplexity"] });
    const delivered = resend.delivered.slice(before);
    expect(delivered.map((d) => d.to).sort()).toEqual([ADMIN, OPERATOR, OWNER].sort());
    const owner = delivered.find((d) => d.to === OWNER);
    expect(owner?.subject).toBe(
      `[${fx.brandName}] Perplexity answered with a different model in Audit #41`,
    );
    expect(owner?.text).toContain(NOTE);
    expect(owner?.text).toContain("You're an owner or admin of this organisation");
    expect(delivered.find((d) => d.to === OPERATOR)?.subject).toMatch(/^\[ops\] /);
  }, 60_000);

  it("a replay sends no second copy, and neither does the inline runner's path", async () => {
    productionEnv();
    const before = resend.delivered.length;
    expect((await runInngestFunction(fx.audits[41])).sent).toBe(3);
    const { sendModelDriftAlert } = await import("@/lib/audit/model-drift-alert");
    expect(await sendModelDriftAlert(fx.audits[41])).toBe(3);
    expect(resend.delivered.length).toBe(before);
  }, 60_000);

  it("#42 (the models match): no alert", async () => {
    productionEnv();
    const calls = resend.send.mock.calls.length;
    expect(await runInngestFunction(fx.audits[42])).toEqual({ sent: 0 });
    const { sendModelDriftAlert } = await import("@/lib/audit/model-drift-alert");
    expect(await sendModelDriftAlert(fx.audits[42])).toBe(0);
    expect(resend.send.mock.calls.length).toBe(calls);
  }, 60_000);
});
