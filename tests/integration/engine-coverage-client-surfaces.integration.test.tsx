/**
 * Engine-failure follow-ups (1 Nov), item 4 -- "3 of 4 engines" where
 * clients see an audit: the client portal, the audit PDF, the narrative
 * report (its figures, since 1 Nov), the audit-complete email and the
 * audit.completed webhook. A
 * fixture shaped like audit #37 (Claude: all 13 calls refused by a monthly
 * spend limit; ChatGPT, Gemini and Perplexity answered all 13; 5 of 30
 * everyday answers mention the brand), and a full-engine audit for which
 * nothing may change.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

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

const ORG_ID = randomUUID();
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

const pdf = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/lib/pdf/render", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pdf/render")>();
  return {
    ...actual,
    renderAuditPdf: vi.fn(async (data: unknown) => {
      pdf.calls.push(data);
      return Buffer.from("%PDF-test");
    }),
  };
});

const BRAND_PARTIAL = randomUUID();
const BRAND_FULL = randomUUID();
const PRIOR_FULL = randomUUID(); // #36, every engine answered
const PARTIAL = randomUUID(); // #37, Claude failed all 13
const FULL = randomUUID(); // #38 (the other brand), every engine answered
const TOKEN_PARTIAL = `portal-p-${randomUUID()}`;
const TOKEN_FULL = `portal-f-${randomUUID()}`;
const OWNER = "owner@coverage-surfaces.example.com.au";
const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"];
const USAGE_LIMIT =
  "HTTP 400 invalid_request_error: You have reached your specified API usage limits. You will regain access on Nov 1, 2026 at 00:00 UTC.";
const MENTION = "Good local options: Omega Services, a Bondi plumber with fast call-outs.";
const NONE = "Good local options: Alpha Plumbing and Beta Plumbing.";
const NOTE =
  "Based on 3 of 4 engines. Claude returned an error for every question: Provider spend limit reached (a monthly limit set in the provider's console).";

let client: ReturnType<typeof postgres>;

async function seedAudit(
  id: string,
  brandId: string,
  n: number,
  opts: { claudeFails: boolean; hoursAgo: number },
) {
  const completedAt = new Date(Date.now() - opts.hoursAgo * 3600000);
  const startedAt = new Date(completedAt.getTime() - 3 * 60000);
  const metadata = opts.claudeFails ? { engineFailures: { claude: 13 } } : {};
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at, created_at, metadata)
    VALUES (${id}, ${brandId}, ${ORG_ID}, ${n}, 'manual', 'complete', ${ENGINES}, 4, 13, 1, 52,
      ${startedAt}, ${completedAt}, ${startedAt}, ${client.json(metadata)})
  `;
  for (const engine of ENGINES) {
    for (let i = 0; i < 13; i++) {
      if (engine === "claude" && opts.claudeFails) {
        await client`
          INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts, latency_ms, cost_usd)
          VALUES (${id}, ${ORG_ID}, 'claude', ${`q${i}`}, ${i}, ${i >= 10}, 'other', ${USAGE_LIMIT}, 1, 350, '0')
        `;
        continue;
      }
      const mentioned =
        i < 2 && engine !== "perplexity" ? true : i === 0 && engine === "perplexity";
      const text = mentioned ? MENTION : NONE;
      await client`
        INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt, sentiment_label, context_label, response_text, response_snippet, cited_sources, llm_model, llm_cost_usd)
        VALUES (${id}, ${engine}, ${`q${i}`}, ${i}, 1, ${mentioned}, ${i >= 10}, 'neutral', 'absent', ${text}, ${text}, ${client.json([])}, 'test-model', '0.010000')
      `;
    }
  }
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`cov-${ORG_ID}`}, 'Coverage Surfaces Agency', ${`cov-${ORG_ID}`})
  `;
  await client`
    INSERT INTO users (clerk_user_id, organization_id, email, name, role)
    VALUES (${`cov-${ORG_ID}`}, ${ORG_ID}, ${OWNER}, 'Owner', 'owner')
  `;
  for (const [id, name, domain] of [
    [BRAND_PARTIAL, "Omega Services", "omega-cov.example.com.au"],
    [BRAND_FULL, "Sigma Plumbing", "sigma-cov.example.com.au"],
  ]) {
    await client`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
      VALUES (${id}, ${ORG_ID}, ${name}, ${domain}, 'tradies', 'au', ARRAY[]::text[])
    `;
  }
  await seedAudit(PRIOR_FULL, BRAND_PARTIAL, 36, { claudeFails: false, hoursAgo: 30 });
  await seedAudit(PARTIAL, BRAND_PARTIAL, 37, { claudeFails: true, hoursAgo: 2 });
  await seedAudit(FULL, BRAND_FULL, 38, { claudeFails: false, hoursAgo: 2 });
  for (const [token, brandId] of [
    [TOKEN_PARTIAL, BRAND_PARTIAL],
    [TOKEN_FULL, BRAND_FULL],
  ]) {
    await client`
      INSERT INTO client_portal_invites (organization_id, brand_id, invite_token)
      VALUES (${ORG_ID}, ${brandId}, ${token})
    `;
  }
  await client`
    INSERT INTO webhook_endpoints (organization_id, url, channel, events, signing_secret)
    VALUES (${ORG_ID}, 'https://hooks.example.com.au/cov', 'custom', ${["audit.completed"]}, 'whsec_test')
  `;
}, 120000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(async () => {
  const ids = [PRIOR_FULL, PARTIAL, FULL];
  await client`DELETE FROM webhook_deliveries WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM webhook_endpoints WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM client_portal_invites WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM audit_exports WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM action_items WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM engine_call_failures WHERE audit_id IN ${client(ids)}`;
  await client`DELETE FROM citations WHERE audit_id IN ${client(ids)}`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("client portal (1 Nov, item 4)", () => {
  async function portalHtml(token: string) {
    const Page = (await import("@/app/client-portal/[inviteToken]/page")).default;
    return renderToStaticMarkup(await Page({ params: Promise.resolve({ inviteToken: token }) }));
  }

  it("#37: '3 of 4 engines' and the plain reason under Visibility -- never the provider's message", async () => {
    const html = await portalHtml(TOKEN_PARTIAL);
    expect(html).toContain("data-engine-coverage");
    expect(html).toContain(NOTE.replace(/'/g, "&#x27;"));
    expect(html).not.toContain("specified API usage limits");
  });

  it("a full-engine audit: no coverage line", async () => {
    const html = await portalHtml(TOKEN_FULL);
    expect(html).not.toContain("data-engine-coverage");
    expect(html).not.toContain("of 4 engines");
  });
});

describe("audit PDF (1 Nov, item 4)", () => {
  async function exportPdf(auditId: string) {
    const { GET } = await import("@/app/api/audits/[auditId]/export/route");
    const before = pdf.calls.length;
    const res = await GET(new Request(`http://localhost/api/audits/${auditId}/export?format=pdf`), {
      params: Promise.resolve({ auditId }),
    });
    expect(res.status).toBe(200);
    return pdf.calls[before] as import("@/lib/pdf/render").AuditPdfData;
  }

  it("#37: the note under the headline, and the comparison with #36 says it isn't like for like", async () => {
    const data = await exportPdf(PARTIAL);
    expect(data.engineCoverage).toEqual({ label: "3 of 4 engines", note: NOTE });
    expect(data.priorEngineCoverageLabel).toBeNull();
    const { buildExecSummary } = await import("@/lib/pdf/render");
    const summary = buildExecSummary(data);
    expect(summary).toMatch(/is mentioned in 17% of AI answers .* from \d+% on /);
    expect(summary).toContain(
      "That's not like for like: this audit is based on 3 of 4 engines, the earlier one on all of them.",
    );
    expect(JSON.stringify(data)).not.toContain("specified API usage limits");
  });

  it("a full-engine audit: no note, no caveat", async () => {
    const data = await exportPdf(FULL);
    expect(data.engineCoverage).toBeNull();
    const { buildExecSummary } = await import("@/lib/pdf/render");
    expect(buildExecSummary(data)).not.toContain("like for like");
  });
});

// DEMO-BLOCKER (1 Nov): the narrative report is now built from the
// report's facts (lib/reports/report-data.ts), not narrative-generator.ts.
// The partial audit is named next to the figures it qualifies.
describe("narrative report (1 Nov, item 4)", () => {
  async function report(brandId: string, auditId?: string) {
    const { withRlsContext } = await import("@/db/client");
    const { buildReportData } = await import("@/lib/reports/report-data");
    const { reportPeriodLabel } = await import("@/lib/reports/report-period");
    const periodLabel = reportPeriodLabel(new Date(Date.now() - 2 * 3600000), "weekly", ORG_ID);
    const data = await withRlsContext(ORG_ID, (tx) =>
      buildReportData(tx, {
        organizationId: ORG_ID,
        brandId,
        periodType: "weekly",
        periodLabel,
        auditId,
      }),
    );
    if (!data) throw new Error("no report data");
    return data;
  }

  it("a report based on #37 says 3 of 4 engines and the plain reason, next to its headline", async () => {
    const { coverageLine } = await import("@/lib/reports/report-format");
    const data = await report(BRAND_PARTIAL, PARTIAL);
    expect(data.coverage.note).toBe(NOTE);
    expect(coverageLine(data)).toBe(
      "3 of 4 engines · Claude: Provider spend limit reached (a monthly limit set in the provider's console)",
    );
  });

  it("#37's week: the trend names #37 as partial and never compares it", async () => {
    const { trendLines } = await import("@/lib/reports/report-format");
    const lines = trendLines(await report(BRAND_PARTIAL));
    expect(lines).toContain(
      "Audit #37 used 3 of 4 engines (Claude: provider spend limit reached), so it's shown but not compared.",
    );
  });

  it("a week with only full-engine audits: no such note", async () => {
    const { coverageLine, trendLines } = await import("@/lib/reports/report-format");
    const data = await report(BRAND_FULL);
    expect(data.coverage.note).toBeNull();
    expect(coverageLine(data)).toBe("4 of 4 engines");
    expect(trendLines(data).join(" ")).not.toContain("not compared");
  });
});

describe("audit-complete email (1 Nov, item 4)", () => {
  type Handler = (ctx: {
    event: { data: { auditId: string } };
    step: { run: (name: string, fn: () => unknown) => unknown };
  }) => Promise<unknown>;

  async function sendFor(auditId: string) {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "Vunnara <audits@vunnara.com.au>");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.vunnara.com.au");
    const before = resend.delivered.length;
    const { sendAuditCompleteEmail } = await import(
      "@/inngest/functions/send-audit-complete-email"
    );
    await (sendAuditCompleteEmail as unknown as { fn: Handler }).fn({
      event: { data: { auditId } },
      step: { run: (_name, fn) => fn() },
    });
    return resend.delivered.slice(before);
  }

  it("#37: the subject says '(3 of 4 engines)'; the body has the reason and what to check", async () => {
    const [email] = await sendFor(PARTIAL);
    expect(email.to).toBe(OWNER);
    expect(email.subject).toBe(
      "Audit #37 complete: Omega Services — Visibility 17% (3 of 4 engines)",
    );
    expect(email.text).toContain(NOTE);
    expect(email.text).toContain(
      "What to check: Raise the monthly spend limit in the provider's console, or wait for it to reset.",
    );
    expect(email.text).toContain("Drift alerts and the weekly trend leave this audit out.");
    expect(email.text).not.toContain("specified API usage limits");
  });

  it("a full-engine audit's email is unchanged", async () => {
    const [email] = await sendFor(FULL);
    // 7 of 40 everyday answers (all four engines) -> 17.5% -> "18%".
    expect(email.subject).toBe("Audit #38 complete: Sigma Plumbing — Visibility 18%");
    expect(email.text).not.toContain("of 4 engines");
    expect(email.text).not.toContain("What to check");
  });
});

describe("audit.completed webhook (1 Nov, item 4)", () => {
  // Webhooks are an Agency-plan feature (lib/pricing/tiers.ts).
  beforeAll(async () => {
    await client`
      INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
      VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test', 'agency', 'monthly', 'active')
    `;
  });
  afterAll(async () => {
    await client`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  });

  type FanoutHandler = (ctx: {
    event: {
      id: string;
      name: string;
      data: { organizationId: string; brandId: string; auditId: string };
    };
    step: { run: (name: string, fn: () => unknown) => unknown };
  }) => Promise<unknown>;

  async function payloadFor(auditId: string, brandId: string) {
    const { inngest } = await import("@/lib/inngest/client");
    const sent: Array<{ data: { payload: Record<string, unknown> } }> = [];
    vi.spyOn(inngest, "send").mockImplementation((async (msg: unknown) => {
      sent.push(msg as { data: { payload: Record<string, unknown> } });
      return { ids: [] };
    }) as unknown as typeof inngest.send);
    const { fanoutWebhooksFn } = await import("@/inngest/functions/fanout-webhooks");
    await (fanoutWebhooksFn as unknown as { fn: FanoutHandler }).fn({
      event: {
        id: `evt-${randomUUID()}`,
        name: "audit.complete",
        data: { organizationId: ORG_ID, brandId, auditId },
      },
      step: { run: (_name, fn) => fn() },
    });
    expect(sent).toHaveLength(1);
    return sent[0].data.payload;
  }

  it("#37: enginesAnswered 3, enginesPlanned 4, fullyFailedEngines ['claude'] -- alongside the existing fields", async () => {
    const payload = await payloadFor(PARTIAL, BRAND_PARTIAL);
    expect(payload).toMatchObject({
      auditId: PARTIAL,
      scoreComposite: expect.any(Number),
      score_basis: "mention_rate",
      enginesAnswered: 3,
      enginesPlanned: 4,
      fullyFailedEngines: ["claude"],
    });
  });

  it("a full-engine audit: 4 of 4, none failed", async () => {
    const payload = await payloadFor(FULL, BRAND_FULL);
    expect(payload).toMatchObject({
      enginesAnswered: 4,
      enginesPlanned: 4,
      fullyFailedEngines: [],
    });
  });
});
