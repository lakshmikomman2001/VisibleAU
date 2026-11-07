/**
 * Engine-failure follow-ups (1 Nov), item 3 (Sri's decision) -- the "a
 * whole engine failed" alert goes to the org's owners AND admins, the same
 * people as every other alert (admins invited from another org included,
 * through app_notification_recipients()), plus the operator list for the
 * [ops] copy. Analysts and viewers never get it, and a replay sends no
 * second copy. Both runners: the Inngest function and the inline runner's
 * sendEngineTotalFailureAlert.
 *
 * Runs as visibleau_app (NOSUPERUSER, NOBYPASSRLS) like
 * notification-recipients-cross-org: a superuser would see the invited
 * admin's row with or without the function.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalSafeDatabaseUrl } from "@/scripts/db/local-db-guard";
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

const ORG = { agency: randomUUID(), home: randomUUID() };
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const DOMAIN = "etf-recipients.example.com.au";
const OWNER = `owner@${DOMAIN}`;
const ADMIN = `admin@${DOMAIN}`;
const ANALYST = `analyst@${DOMAIN}`;
const VIEWER = `viewer@${DOMAIN}`;
const INVITED_ADMIN = `invited-admin@${DOMAIN}`;
const INVITED_ANALYST = `invited-analyst@${DOMAIN}`;
const OPERATOR = `ops@${DOMAIN}`;
const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"];
/** Audit #37's real cause (Sri's Anthropic console, 1 Nov). */
const USAGE_LIMIT =
  "HTTP 400 invalid_request_error: You have reached your specified API usage limits. You will regain access on Nov 1, 2026 at 00:00 UTC.";

let su: ReturnType<typeof postgres>;

function appRoleUrl(): string {
  const base = new URL(getTestDatabaseUrl());
  base.username = "visibleau_app";
  base.password = "visibleau_app_dev";
  const url = base.toString();
  assertLocalSafeDatabaseUrl(url);
  return url;
}

/** An account in `homeOrg` with `accountRole`, and a membership of the agency with `memberRole`. */
async function addPerson(email: string, homeOrg: string, accountRole: string, memberRole: string) {
  const id = randomUUID();
  await su`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${id}, ${`etfr-${id}`}, ${homeOrg}, ${email}, 'Test', ${accountRole})
  `;
  await su`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG.agency}, ${id}, ${memberRole}, now() + interval '7 days', now(), true)
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  su = postgres(url, { max: 1 });
  process.env.DATABASE_URL = appRoleUrl();
  process.env.SERVICE_DATABASE_URL = url;
  // visibleau_app has production's grants (prod-fix 0052), checked by tests/integration/global-setup.ts.

  for (const [id, name] of [
    [ORG.agency, "ETF Recipients Agency"],
    [ORG.home, "ETF Recipients Home"],
  ]) {
    await su`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${id}, ${`etfr-${id}`}, ${name}, ${`etfr-${id}`})
    `;
  }
  await addPerson(OWNER, ORG.agency, "owner", "owner");
  await addPerson(ADMIN, ORG.agency, "admin", "admin");
  await addPerson(ANALYST, ORG.agency, "analyst", "analyst");
  await addPerson(VIEWER, ORG.agency, "viewer", "viewer");
  // Invited from another org: their accounts stay in their home org.
  await addPerson(INVITED_ADMIN, ORG.home, "owner", "admin");
  await addPerson(INVITED_ANALYST, ORG.home, "member", "analyst");

  await su`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG.agency}, 'Omega Services', 'omega-etfr.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  await su`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at, metadata)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG.agency}, 37, 'manual', 'complete', ${ENGINES}, 4, 13, 1, 52,
      now() - interval '3 minutes', now(), ${su.json({ engineFailures: { claude: 13 } })})
  `;
  for (let i = 0; i < 13; i++) {
    await su`
      INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts, latency_ms, cost_usd)
      VALUES (${AUDIT_ID}, ${ORG.agency}, 'claude', ${`q${i}`}, ${i}, ${i >= 10}, 'other', ${USAGE_LIMIT}, 1, 350, '0')
    `;
  }
}, 60000);

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  const orgs = Object.values(ORG);
  await su`DELETE FROM engine_call_failures WHERE audit_id = ${AUDIT_ID}`;
  await su`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await su`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await su`DELETE FROM org_members WHERE organization_id IN ${su(orgs)}`;
  await su`DELETE FROM users WHERE organization_id IN ${su(orgs)}`;
  await su`DELETE FROM organizations WHERE id IN ${su(orgs)}`;
  await su.end();
});

function productionEnv() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "Vunnara <audits@vunnara.com.au>");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.vunnara.com.au");
  vi.stubEnv("PLATFORM_ADMIN_EMAILS", OPERATOR);
}

type NotifyHandler = (ctx: {
  event: { data: { auditId: string } };
  step: { run: (name: string, fn: () => unknown) => unknown };
}) => Promise<{ sent: number; engines?: string[] }>;

async function runInngestFunction() {
  const { notifyEngineTotalFailure } = await import(
    "@/inngest/functions/notify-engine-total-failure"
  );
  return (notifyEngineTotalFailure as unknown as { fn: NotifyHandler }).fn({
    event: { data: { auditId: AUDIT_ID } },
    step: { run: (_name, fn) => fn() },
  });
}

describe("the whole-engine-failure alert reaches owners and admins (1 Nov, item 3)", () => {
  it("owner, admin, the admin invited from another org, and the operator -- never an analyst or a viewer", async () => {
    productionEnv();
    const before = resend.delivered.length;
    const result = await runInngestFunction();

    expect(result).toEqual({ sent: 4, engines: ["claude"] });
    const delivered = resend.delivered.slice(before);
    expect(delivered.map((d) => d.to).sort()).toEqual(
      [ADMIN, INVITED_ADMIN, OPERATOR, OWNER].sort(),
    );
    for (const excluded of [ANALYST, VIEWER, INVITED_ANALYST]) {
      expect(delivered.map((d) => d.to)).not.toContain(excluded);
    }

    const admin = delivered.find((d) => d.to === ADMIN);
    expect(admin?.subject).toBe(
      "[Omega Services] Claude returned an error for every question in Audit #37",
    );
    expect(admin?.text).toContain("You're an owner or admin of this organisation");
    // Item 1: #37's real cause, by its plain reason -- never the provider's sentence.
    expect(admin?.text).toContain(
      "Provider spend limit reached (a monthly limit set in the provider's console)",
    );
    expect(admin?.text).not.toContain("specified API usage limits");
    const operator = delivered.find((d) => d.to === OPERATOR);
    expect(operator?.subject).toMatch(/^\[ops\] /);
  });

  it("a replay (Inngest re-running the function) sends no second copy", async () => {
    productionEnv();
    const before = resend.delivered.length;
    const result = await runInngestFunction();
    expect(result.sent).toBe(4);
    expect(resend.delivered.length).toBe(before);
  });

  it("the inline runner's path sends to the same people, and no duplicates either", async () => {
    productionEnv();
    const callsBefore = resend.send.mock.calls.length;
    const deliveredBefore = resend.delivered.length;
    const { sendEngineTotalFailureAlert } = await import("@/lib/audit/engine-total-failure-alert");
    expect(await sendEngineTotalFailureAlert(AUDIT_ID)).toBe(4);
    const sentTo = resend.send.mock.calls.slice(callsBefore).map((c) => c[0].to);
    expect(sentTo.sort()).toEqual([ADMIN, INVITED_ADMIN, OPERATOR, OWNER].sort());
    expect(resend.delivered.length).toBe(deliveredBefore);
  });

  it("someone on both lists gets the operator copy only", async () => {
    productionEnv();
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", `${OPERATOR},${ADMIN}`);
    const callsBefore = resend.send.mock.calls.length;
    const { sendEngineTotalFailureAlert } = await import("@/lib/audit/engine-total-failure-alert");
    await sendEngineTotalFailureAlert(AUDIT_ID);
    const toAdmin = resend.send.mock.calls.slice(callsBefore).filter((c) => c[0].to === ADMIN);
    expect(toAdmin).toHaveLength(1);
    expect(toAdmin[0][0].subject).toMatch(/^\[ops\] /);
  });
});
