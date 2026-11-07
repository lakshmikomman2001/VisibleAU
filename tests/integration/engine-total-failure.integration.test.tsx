// @vitest-environment jsdom
/**
 * URGENT audit #37 (31 Oct), item 2 -- one engine failing every call is
 * loud, not silent. A fixture shaped like production audit #37 (Claude:
 * 13 of 13 calls failed with Anthropic's "credit balance is too low", the
 * other three engines answered all 13, 30 everyday answers, 5 mentions):
 *
 * - the poll endpoint and the running page show "0 of 13 answered · 13
 *   failed" in the error colour with a plain reason, and "52 calls
 *   finished · 13 failed";
 * - the finished page shows the banner above the headline;
 * - drift skips the audit, and never uses it as the comparison base;
 * - the weekly trend leaves it out;
 * - one alert per recipient (owner and operator), not two on replay, and
 *   `engine_total_failure` is logged -- no provider message anywhere.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { cleanup, render, screen, within } from "@testing-library/react";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
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

const ORG_ID = randomUUID();
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));
const router = vi.hoisted(() => ({ refresh: () => {}, push: () => {}, back: () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

const BRAND_ID = randomUUID();
const FULL_OLD = randomUUID(); // #35, every engine answered
const PARTIAL = randomUUID(); // #37, Claude failed all 13
const FULL_NEW = randomUUID(); // #38, every engine answered
const RUNNING = randomUUID(); // #39, every call finished, not finalized yet
const OWNER = "owner@engine-failure-test.example.com.au";
const OPERATOR = "ops@engine-failure-test.example.com.au";
const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"];
const CREDIT =
  "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.";
const MENTION = "Good local options: Omega Services, a Bondi plumber with fast call-outs.";
const NONE = "Good local options: Alpha Plumbing and Beta Plumbing.";

let client: ReturnType<typeof postgres>;

async function seedAudit(
  id: string,
  n: number,
  opts: { claudeFails: boolean; status: "complete" | "running"; daysAgo: number },
) {
  const metadata =
    opts.claudeFails && opts.status === "complete" ? { engineFailures: { claude: 13 } } : {};
  const completedAt = new Date(Date.now() - opts.daysAgo * 86400000);
  const startedAt = new Date(completedAt.getTime() - 3 * 60000);
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at, created_at, metadata)
    VALUES (${id}, ${BRAND_ID}, ${ORG_ID}, ${n}, 'manual', ${opts.status}, ${ENGINES}, 4, 13, 1, 52,
      ${startedAt}, ${opts.status === "complete" ? completedAt : null}, ${startedAt}, ${client.json(metadata)})
  `;
  for (const engine of ENGINES) {
    for (let i = 0; i < 13; i++) {
      if (engine === "claude" && opts.claudeFails) {
        await client`
          INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts, latency_ms, cost_usd)
          VALUES (${id}, ${ORG_ID}, 'claude', ${`q${i}`}, ${i}, ${i >= 10}, 'other', ${CREDIT}, 1, 400, '0')
        `;
        continue;
      }
      // 5 everyday mentions across the three answering engines.
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
    VALUES (${ORG_ID}, ${`etf-${ORG_ID}`}, 'Engine Failure Test Agency', ${`etf-${ORG_ID}`})
  `;
  await client`
    INSERT INTO users (clerk_user_id, organization_id, email, name, role)
    VALUES (${`etf-${ORG_ID}`}, ${ORG_ID}, ${OWNER}, 'Owner', 'owner')
  `;
  // Sri, 8 Nov: workspace email goes to accepted, active owner and admin memberships only (as every
  // production owner has: diag-0132), not to a profile whose users.role alone says owner.
  await client`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    SELECT ${ORG_ID}, id, 'owner', now(), now(), true FROM users WHERE clerk_user_id = ${`etf-${ORG_ID}`}
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Omega Services', 'omega-etf.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  await seedAudit(FULL_OLD, 35, { claudeFails: false, status: "complete", daysAgo: 3 });
  await seedAudit(PARTIAL, 37, { claudeFails: true, status: "complete", daysAgo: 2 });
  await seedAudit(FULL_NEW, 38, { claudeFails: false, status: "complete", daysAgo: 1 });
  await seedAudit(RUNNING, 39, { claudeFails: true, status: "running", daysAgo: 0 });
}, 120000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  const ids = [FULL_OLD, PARTIAL, FULL_NEW, RUNNING];
  await client`DELETE FROM drift_alerts WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM action_items WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM engine_call_failures WHERE audit_id IN ${client(ids)}`;
  await client`DELETE FROM citations WHERE audit_id IN ${client(ids)}`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function pollBody(auditId: string) {
  const { GET } = await import("@/app/api/audits/[auditId]/route");
  const res = await GET(new Request(`http://localhost/api/audits/${auditId}`), {
    params: Promise.resolve({ auditId }),
  });
  return { raw: await res.clone().text(), body: await res.json() };
}

describe("running page: answered and failed are separate", () => {
  it("the poll endpoint: Claude 0 answered, 13 failed, a plain reason -- never the message", async () => {
    const { raw, body } = await pollBody(RUNNING);
    const claude = body.engineProgress.find((e: { engine: string }) => e.engine === "claude");
    const chatgpt = body.engineProgress.find((e: { engine: string }) => e.engine === "chatgpt");
    expect(claude).toMatchObject({
      done: 13,
      answered: 0,
      failed: 13,
      total: 13,
      failureReason: "Provider error: account/credit issue",
    });
    expect(chatgpt).toMatchObject({ answered: 13, failed: 0, failureReason: null });
    expect(body.failedCount).toBe(13);
    // Item 4: 10 of Claude's 13 were everyday questions.
    expect(body.everydayFailedCount).toBe(10);
    expect(raw).not.toContain("credit balance");
  });

  it("the page: '0 of 13 answered · 13 failed' in the error colour, with the reason; '52 calls finished · 13 failed'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        (await import("@/app/api/audits/[auditId]/route")).GET(
          new Request(`http://localhost/api/audits/${RUNNING}`),
          { params: Promise.resolve({ auditId: RUNNING }) },
        ),
      ),
    );
    const { AuditRunningView } = await import("@/components/domain/audit/audit-running");
    const { container } = render(
      <AuditRunningView
        auditId={RUNNING}
        brandId={BRAND_ID}
        brandName="Omega Services"
        initialStatus="running"
        initialProgress={100}
        initialCost={0}
        initialCostIncomplete={false}
        initialMentionedCount={5}
        initialSampleCount={30}
        initialMedianPosition={null}
        initialRankedCount={0}
        initialCompletedCalls={52}
        initialFailedCalls={13}
        totalCalls={52}
        engineCount={4}
        promptCount={13}
        runCount={1}
        typicalDurationMinutes={null}
        errorMessage={null}
      />,
    );
    expect(screen.getByText("52 calls finished")).toBeInTheDocument();
    expect(
      screen.getByText("Querying 13 questions × 4 engines (39/52 answered · 13 failed)"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/· 13 failed/).length).toBeGreaterThanOrEqual(2);

    // The per-engine rows arrive with the first poll (3 s).
    const claudeRow = await waitForRow(container, "claude");
    expect(within(claudeRow).getByText(/0 of 13 answered/)).toBeInTheDocument();
    const failed = claudeRow.querySelector("[data-failed-count]") as HTMLElement;
    expect(failed.textContent).toContain("13 failed");
    expect(failed.style.color).toBe("var(--danger)");
    const reason = claudeRow.querySelector("[data-failure-reason]") as HTMLElement;
    expect(reason.textContent).toBe("Provider error: account/credit issue");
    expect(reason.style.color).toBe("var(--danger)");

    const chatgptRow = container.querySelector('[data-engine-row="chatgpt"]') as HTMLElement;
    expect(within(chatgptRow).getByText(/13 of 13 answered/)).toBeInTheDocument();
    expect(chatgptRow.querySelector("[data-failed-count]")).toBeNull();
    // Item 4, from the same poll.
    expect(
      screen.getByText("across 30 successful answers to everyday questions (10 failed)"),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("credit balance");
  }, 20000);
});

async function waitForRow(container: HTMLElement, engine: string): Promise<HTMLElement> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const row = container.querySelector(`[data-engine-row="${engine}"]`);
    if (row) return row as HTMLElement;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no row for ${engine}`);
}

describe("finished page: a banner above the headline", () => {
  it("names the engine, the basis and the reason; keeps the '13 failed' line", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const element = await AuditPage({
      params: Promise.resolve({ auditId: PARTIAL }),
      searchParams: Promise.resolve({}),
    });
    document.body.innerHTML = renderToStaticMarkup(element);
    const banner = document.body.querySelector("[data-engine-total-failure]") as HTMLElement;
    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.textContent).toContain(
      "Claude returned an error for all 13 questions, so this audit's Visibility is based on 3 engines (30 answers).",
    );
    expect(banner.textContent).toContain("Provider error: account/credit issue");
    expect(within(banner).getByText("What to check")).toBeInTheDocument();
    // Above the headline: the banner comes before the "Visibility" label.
    const html = document.body.innerHTML;
    expect(html.indexOf("data-engine-total-failure")).toBeLessThan(html.indexOf(">Visibility<"));
    expect(document.body.textContent).toContain("3 of 4 engines");
    expect(document.body.textContent).toContain("13 failed: 13 errors, not counted");
    expect(document.body.textContent).not.toContain("credit balance");
  });

  it("an audit where every engine answered has no banner", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const element = await AuditPage({
      params: Promise.resolve({ auditId: FULL_NEW }),
      searchParams: Promise.resolve({}),
    });
    document.body.innerHTML = renderToStaticMarkup(element);
    expect(document.body.querySelector("[data-engine-total-failure]")).toBeNull();
  });
});

type StepResults = Record<string, unknown>;
function recordingStep(results: StepResults) {
  return {
    run: async (name: string, fn: () => unknown) => {
      const out = await fn();
      results[name] = out;
      return out;
    },
  };
}

describe("drift: an audit missing an engine is never compared", () => {
  type DriftHandler = (ctx: {
    event: { data: { auditId: string; brandId: string; organizationId: string } };
    step: ReturnType<typeof recordingStep>;
  }) => Promise<{ skipped?: boolean; reason?: string }>;

  it("the partial audit itself: skipped, no drift alert", async () => {
    const { detectDriftFn } = await import("@/inngest/functions/detect-drift");
    const result = await (detectDriftFn as unknown as { fn: DriftHandler }).fn({
      event: { data: { auditId: PARTIAL, brandId: BRAND_ID, organizationId: ORG_ID } },
      step: recordingStep({}),
    });
    expect(result).toEqual({ skipped: true, reason: "engine_total_failure" });
    const rows = await client`SELECT id FROM drift_alerts WHERE current_audit_id = ${PARTIAL}`;
    expect(rows).toHaveLength(0);
  });

  it("the next audit is compared with the last whole one, not the partial one", async () => {
    const { detectDriftFn } = await import("@/inngest/functions/detect-drift");
    const results: StepResults = {};
    await (detectDriftFn as unknown as { fn: DriftHandler }).fn({
      event: { data: { auditId: FULL_NEW, brandId: BRAND_ID, organizationId: ORG_ID } },
      step: recordingStep(results),
    });
    const loaded = results["load-audits"] as { previous: { id: string } | null };
    expect(loaded.previous?.id).toBe(FULL_OLD);
  });
});

describe("weekly trend: the partial audit is left out", () => {
  it("averages the two whole audits only", async () => {
    const { serviceDb } = await import("@/db/client");
    const { aggregateVisibilityTrend } = await import(
      "@/lib/visibility/visibility-trend-aggregator"
    );
    const trend = await aggregateVisibilityTrend(serviceDb, {
      brandId: BRAND_ID,
      organizationId: ORG_ID,
      periodLabel: "test",
      periodType: "weekly",
      periodStart: new Date(Date.now() - 10 * 86400000),
      periodEnd: new Date(Date.now() + 86400000),
      brandDomain: "omega-etf.example.com.au",
    });
    expect(trend.auditCount).toBe(2);
  });
});

describe("operator alert: owner and operator, once", () => {
  type NotifyHandler = (ctx: {
    event: { data: { auditId: string } };
    step: ReturnType<typeof recordingStep>;
  }) => Promise<{ sent: number; engines?: string[] }>;

  function productionEnv() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "Vunnara <audits@vunnara.com.au>");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.vunnara.com.au");
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", ` ${OPERATOR} , @vunnara.com.au`);
  }

  it("one email each to the owner and the operator, not two on replay; logs engine_total_failure", async () => {
    productionEnv();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { notifyEngineTotalFailure } = await import(
      "@/inngest/functions/notify-engine-total-failure"
    );
    const handler = (notifyEngineTotalFailure as unknown as { fn: NotifyHandler }).fn;
    const before = resend.delivered.length;

    const first = await handler({ event: { data: { auditId: PARTIAL } }, step: recordingStep({}) });
    // Inngest replaying the whole function (or a retried send step).
    const replay = await handler({
      event: { data: { auditId: PARTIAL } },
      step: recordingStep({}),
    });

    expect(first).toEqual({ sent: 2, engines: ["claude"] });
    expect(replay.sent).toBe(2);
    const delivered = resend.delivered.slice(before);
    expect(delivered.map((d) => d.to).sort()).toEqual([OPERATOR, OWNER]);
    const operatorEmail = delivered.find((d) => d.to === OPERATOR);
    const ownerEmail = delivered.find((d) => d.to === OWNER);
    expect(operatorEmail?.subject).toBe(
      "[ops] [Omega Services] Claude returned an error for every question in Audit #37",
    );
    expect(ownerEmail?.subject).toBe(
      "[Omega Services] Claude returned an error for every question in Audit #37",
    );
    expect(ownerEmail?.text).toContain(
      "Claude returned an error for all 13 questions, so this audit's Visibility is based on 3 engines (30 answers).",
    );
    expect(operatorEmail?.text).toContain("Provider error: account/credit issue (other)");
    for (const d of delivered) {
      expect(d.html).not.toContain("credit balance");
      expect(d.text).not.toContain("credit balance");
    }

    const logs = warn.mock.calls
      .map((c) => String(c[0]))
      .filter((line) => line.includes('"engine_total_failure"'))
      .map((line) => JSON.parse(line));
    expect(logs[0]).toEqual({
      event: "engine_total_failure",
      auditId: PARTIAL,
      organizationId: ORG_ID,
      engine: "claude",
      errorClass: "other",
      statusCode: null,
      reason: "account_or_credit",
      failedCalls: 13,
    });
    expect(JSON.stringify(logs)).not.toContain("@");
    warn.mockRestore();
  });

  it("an audit where every engine answered sends nothing", async () => {
    productionEnv();
    const { notifyEngineTotalFailure } = await import(
      "@/inngest/functions/notify-engine-total-failure"
    );
    const before = resend.delivered.length;
    const result = await (notifyEngineTotalFailure as unknown as { fn: NotifyHandler }).fn({
      event: { data: { auditId: FULL_NEW } },
      step: recordingStep({}),
    });
    expect(result).toEqual({ sent: 0 });
    expect(resend.delivered.length).toBe(before);
  });
});
