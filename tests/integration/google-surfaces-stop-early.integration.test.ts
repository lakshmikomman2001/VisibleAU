/**
 * Google AI follow-ups (12 Nov), part 3 -- stop early on login and credit errors, and tell the operator.
 * Production audit #44 sent all 26 Google tasks with a login DataForSEO refused (40100), and every one failed
 * the same way.
 *
 * - The first refused login stops the rest: the AI Overviews batch is refused (DataForSEO's REAL 401 / 40100
 *   answer, tests/helpers/dataforseo-recorded.ts), the AI Mode batch is never sent, and its questions are
 *   "not completed" with the category; the customer reads one plain reason, never the provider's message.
 * - The operators (PLATFORM_ADMIN_EMAILS) get one email, at most once per category per 24 hours; nothing in
 *   it is a credential. /admin/settings' "Last Google run" says "login rejected at <time> (audit #N)".
 * - A timeout on one task doesn't stop the others: it's retried once (today's rule) and then failed alone.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import {
  recordedDataForSeoFetch,
  recordedFixture,
  recordedQuestions,
} from "@/tests/helpers/dataforseo-recorded";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { emails } = vi.hoisted(() => ({ emails: [] as Record<string, unknown>[] }));
vi.mock("@/lib/email/send", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/send")>();
  return {
    ...actual,
    sendEmailOrThrow: vi.fn(async (email: Record<string, unknown>) => {
      emails.push(email);
      return "test-email-id";
    }),
  };
});

const ORG = randomUUID();
const QUESTIONS = recordedQuestions();
const OPERATOR = "ops-google@example.test";
const ALERT_KEYS = ["google-provider-alert:login_rejected", "google-provider-alert:out_of_credit"];
let client: ReturnType<typeof postgres>;
let auditNumber = 0;

type StepLog = { id: string; data?: Record<string, unknown> }[];
type Handler = (ctx: {
  event: { data: Record<string, unknown> };
  step: unknown;
}) => Promise<unknown>;

function recordingStep() {
  const log: StepLog = [];
  return {
    log,
    step: {
      run: async (id: string, fn: () => unknown) => {
        log.push({ id });
        return fn();
      },
      sleep: async (id: string) => {
        log.push({ id });
      },
      sendEvent: async (id: string, payload: { data: Record<string, unknown> }) => {
        log.push({ id, data: payload.data });
        return { ids: [] };
      },
    },
  };
}

async function googleAudit(): Promise<{ auditId: string; number: number; log: StepLog }> {
  const brandId = randomUUID();
  const auditId = randomUUID();
  const number = ++auditNumber;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack,
      prompt_pack_generator_version, classification_status, classification, categories, audience,
      category_confirmed_at, suburb, state, country, location_mode, location_confirmed_at)
    VALUES (${brandId}, ${ORG}, 'Omega Services', 'omegaservices.com.au', 'tradies', 'au',
      ARRAY['NSW:Norwest']::text[], ${client.json(QUESTIONS)}, ${PROMPT_GENERATOR_VERSION}, 'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      ARRAY['trades_plumbing']::text[], 'households', now(), 'Norwest', 'NSW', 'Australia', 'fixed', now())
  `;
  await client`INSERT INTO brand_google_locations (brand_id, organization_id, postcode) VALUES (${brandId}, ${ORG}, '2153')`;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
    VALUES (${auditId}, ${brandId}, ${ORG}, ${number}, 'manual', 'pending', ${client.json({ mockScenario: "happy_path" })})
  `;
  const { runAudit } = await import("@/inngest/functions/run-audit");
  const { collectGoogleSurfacesFn } = await import("@/inngest/functions/collect-google-surfaces");
  const audit = recordingStep();
  await (runAudit as unknown as { fn: Handler }).fn({
    event: { data: { auditId, organizationId: ORG } },
    step: audit.step,
  });
  const dispatch = audit.log.find((e) => e.id === "google-surfaces-dispatch");
  if (!dispatch?.data) throw new Error("run-audit didn't hand over to Google");
  const google = recordingStep();
  await (collectGoogleSurfacesFn as unknown as { fn: Handler }).fn({
    event: { data: dispatch.data },
    step: google.step,
  });
  return { auditId, number, log: google.log };
}

async function rows(auditId: string) {
  return client<
    {
      surface: string;
      outcome: string;
      outcome_reason: string | null;
      provider_status_code: number | null;
      provider_task_id: string | null;
    }[]
  >`
    SELECT surface, outcome, outcome_reason, provider_status_code, provider_task_id
    FROM google_surface_results WHERE audit_id = ${auditId} ORDER BY surface, prompt_index
  `;
}

function switchOn() {
  vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "true");
  vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
  vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
  vi.stubEnv("PLATFORM_ADMIN_EMAILS", OPERATOR);
}

const PROBLEM_ON_OUR_SIDE =
  "Google couldn't be checked this time because of a problem on our side. It will be checked again on the next audit.";

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`google-stop-${ORG}`}, 'Google Stop Early Test Org', ${`google-stop-${ORG}`})
  `;
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_${ORG}`}, ${`sub_${ORG}`}, 'price_test_growth', 'growth', 'monthly', 'active')
  `;
  for (const key of ["google_ai_overviews_enabled", "google_ai_mode_enabled"]) {
    await client`
      INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled, reason, set_by)
      VALUES (${ORG}, ${key}, true, 'test', 'test')
    `;
  }
  const settings = await client`SELECT count(*)::int AS n FROM feature_settings`;
  if (settings[0].n > 0) throw new Error("feature_settings isn't empty on the test database");
}, 60_000);

beforeEach(async () => {
  emails.length = 0;
  await client`DELETE FROM rate_limit_counters WHERE bucket_key IN ${client(ALERT_KEYS)}`;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`DELETE FROM rate_limit_counters WHERE bucket_key IN ${client(ALERT_KEYS)}`;
  await deleteOrgRows(client, ORG);
  await client.end();
});

describe("a refused login stops the audit's Google run", () => {
  it("the first 40100 stops the rest: AI Mode is never sent, its questions are 'not completed', the customer reads one plain reason", async () => {
    switchOn();
    const provider = recordedDataForSeoFetch({ rejected: true });
    vi.stubGlobal("fetch", provider.fetchImpl);
    const { auditId, log } = await googleAudit();

    // One request: the AI Overviews batch. Nothing after the refusal (no AI Mode post, no fetches).
    expect(
      provider.calls.map(
        (c) => `${c.method} ${c.url.replace("https://api.dataforseo.com/v3", "")}`,
      ),
    ).toEqual(["POST /serp/google/organic/task_post"]);
    // Nothing to wait for: no sleeps, straight to the end.
    expect(log.map((e) => e.id)).toEqual(["google:post", "google:finish", "google:audit-complete"]);

    const stored = await rows(auditId);
    const aio = stored.filter((r) => r.surface === "google_ai_overviews");
    const aim = stored.filter((r) => r.surface === "google_ai_mode");
    expect(aio.map((r) => [r.outcome, r.provider_status_code])).toEqual(
      QUESTIONS.map(() => ["failed", 40100]),
    );
    expect(aio[0].outcome_reason).toContain("40100 You are not authorized to access this resource");
    // 12 Nov, part 7: a refused task keeps the provider's whole answer, for the operator.
    const [refused] = await client`
      SELECT raw_response AS raw FROM google_surface_results
      WHERE audit_id = ${auditId} AND surface = 'google_ai_overviews' AND prompt_index = 0
    `;
    const { tasks: _none, ...answer } = recordedFixture("rejected-login-40100.json");
    expect(refused.raw).toEqual(answer);
    expect(aim.map((r) => [r.outcome, r.provider_status_code, r.provider_task_id])).toEqual(
      QUESTIONS.map(() => ["not_completed", 40100, null]),
    );
    expect(aim[0].outcome_reason).toBe(
      "Not sent: the provider answered 40100 (login rejected) earlier in this audit, so the rest weren't sent.",
    );

    const { withRlsContext } = await import("@/db/client");
    const { loadGoogleSurfaceSummary, googleSurfaceBlock } = await import(
      "@/lib/audit/google-surfaces/summary"
    );
    const summary = await withRlsContext(ORG, (tx) => loadGoogleSurfaceSummary(tx, auditId));
    if (!summary) throw new Error("no summary");
    expect(googleSurfaceBlock(summary).lines).toEqual([
      "AI Overviews: couldn't be checked this time",
      "AI Mode: couldn't be checked this time",
      PROBLEM_ON_OUR_SIDE,
    ]);
  }, 180_000);

  it("the operators are emailed once per category per 24 hours, with no credential; /admin/settings shows the last run", async () => {
    switchOn();
    vi.stubGlobal("fetch", recordedDataForSeoFetch({ rejected: true }).fetchImpl);
    const first = await googleAudit();
    expect(emails).toHaveLength(1);
    const email = emails[0] as { to: string; subject: string; text: string; html: string };
    expect(email.to).toBe(OPERATOR);
    expect(email.subject).toBe(
      `[ops] Google AI checks stopped: login rejected (Audit #${first.number})`,
    );
    expect(email.text).toContain("DataForSEO answered 40100 (login rejected)");
    for (const secret of ["test-login", "test-password", "Basic ", "Authorization"]) {
      expect(email.text).not.toContain(secret);
      expect(email.html).not.toContain(secret);
    }
    // The provider's own message (with its URL) stays on /admin/settings.
    expect(email.text).not.toContain("You are not authorized");

    // Within 24 hours: the second refused audit stops the same way, and no second email.
    const second = await googleAudit();
    expect((await rows(second.auditId)).filter((r) => r.outcome === "not_completed")).toHaveLength(
      4,
    );
    expect(emails).toHaveLength(1);

    // 25 hours later: one more.
    await client`
      UPDATE rate_limit_counters SET window_start = now() - interval '25 hours'
      WHERE bucket_key = 'google-provider-alert:login_rejected'
    `;
    await googleAudit();
    expect(emails).toHaveLength(2);

    const { loadGoogleOperatorHealth } = await import("@/lib/audit/google-surfaces/operator");
    const health = await loadGoogleOperatorHealth();
    expect(health.lastRun?.auditNumber).toBe(auditNumber);
    expect(health.lastRun?.problem).toMatchObject({ code: 40100, label: "login rejected" });
    expect(health.lastRun?.line).toMatch(
      new RegExp(
        `^Last Google run: login rejected at .+ \\(audit #${auditNumber}, Omega Services\\)$`,
      ),
    );
  }, 300_000);

  it("a timeout on one task doesn't stop the others", async () => {
    switchOn();
    const lostId = (recordedFixture("aio-task-get-q01.json").tasks as { id: string }[])[0].id;
    const provider = recordedDataForSeoFetch({ timeoutTasks: [lostId] });
    vi.stubGlobal("fetch", provider.fetchImpl);
    const { auditId } = await googleAudit();
    const stored = await rows(auditId);
    const failed = stored.filter((r) => r.outcome === "failed");
    // Retried once (today's rule), then failed alone, with no provider code.
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ surface: "google_ai_overviews", provider_status_code: null });
    expect(failed[0].outcome_reason).toBe(
      "No answer from the provider within 60 seconds (TimeoutError).",
    );
    expect(stored.filter((r) => r.outcome === "not_completed")).toHaveLength(0);
    expect(stored.filter((r) => r.outcome === "shown" || r.outcome === "not_shown")).toHaveLength(
      7,
    );
    expect(emails).toHaveLength(0);
  }, 180_000);
});
