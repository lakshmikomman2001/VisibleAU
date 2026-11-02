/**
 * 3 Nov ("Server-side plan checks for the paid features that have none") -- each
 * paid feature against the real routes, the real jobs and the local test database:
 * a plan without it gets 403 and writes nothing; a plan with it works. Which plan
 * has what comes from lib/pricing/tiers.ts. Seats: active members plus pending
 * invites, counted inside the invite's transaction, so two invites can't race past
 * the limit.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const currentUser = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser.value),
}));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: vi.fn(async () => ({ ok: true, id: "em_test" })),
}));

const RUN = randomUUID().slice(0, 8);
const ORG = randomUUID();
const OWNER = randomUUID();
const BRAND = randomUUID();
const ENDPOINT = randomUUID();
const INVITE = randomUUID();
const AGENCY_MESSAGE = "This is part of the Agency plan";
const PRO_MESSAGE = "This is part of the Agency Pro plan";

let sql: ReturnType<typeof postgres>;
const otherOrgs: string[] = [];

async function setPlan(tier: string | null, status = "active") {
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG}`;
  if (!tier) return;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_${RUN}`}, ${`sub_${RUN}`}, 'price_test', ${tier}, 'monthly', ${status})
  `;
}

type Handler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

interface Call {
  label: string;
  method: string;
  body?: unknown;
  load: () => Promise<unknown>;
  /** What it answers on a plan with the feature. */
  allowed: number;
}

async function send(call: Call): Promise<Response> {
  const mod = (await call.load()) as Record<string, Handler>;
  return mod[call.method](
    new NextRequest("http://localhost/api/test", {
      method: call.method,
      ...(call.body === undefined
        ? {}
        : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(call.body) }),
    }),
    { params: Promise.resolve({ id: ENDPOINT, orgId: ORG }) },
  );
}

const CLIENT_PORTAL: Call[] = [
  {
    label: "POST /api/client-portal/invites",
    method: "POST",
    body: { brandId: BRAND },
    load: () => import("@/app/api/client-portal/invites/route"),
    allowed: 201,
  },
];
const WEBHOOKS: Call[] = [
  {
    label: "GET /api/webhooks-config",
    method: "GET",
    load: () => import("@/app/api/webhooks-config/route"),
    allowed: 200,
  },
  {
    label: "POST /api/webhooks-config",
    method: "POST",
    body: { url: "https://hooks.example.com/a", channel: "custom", events: ["audit.completed"] },
    load: () => import("@/app/api/webhooks-config/route"),
    allowed: 200,
  },
  {
    label: "PATCH /api/webhooks-config/[id]",
    method: "PATCH",
    body: { isActive: true },
    load: () => import("@/app/api/webhooks-config/[id]/route"),
    allowed: 200,
  },
  {
    label: "POST /api/webhooks-config/[id]/test",
    method: "POST",
    load: () => import("@/app/api/webhooks-config/[id]/test/route"),
    allowed: 200,
  },
];
const BULK: Call[] = [
  {
    label: "POST /api/agency/bulk-reaudit",
    method: "POST",
    body: { brandIds: [BRAND] },
    load: () => import("@/app/api/agency/bulk-reaudit/route"),
    allowed: 202,
  },
  {
    label: "POST /api/agency/bulk-export",
    method: "POST",
    body: { brandIds: [BRAND] },
    load: () => import("@/app/api/agency/bulk-export/route"),
    allowed: 200,
  },
];
const GA4: Call[] = [
  {
    label: "GET /api/agency/ga4-config",
    method: "GET",
    load: () => import("@/app/api/agency/ga4-config/route"),
    allowed: 200,
  },
  {
    label: "PATCH /api/agency/ga4-config",
    method: "PATCH",
    body: { ga4MeasurementId: "G-TEST", ga4ApiSecret: "test-secret" },
    load: () => import("@/app/api/agency/ga4-config/route"),
    allowed: 200,
  },
];

const NOT_AN_AGENCY_PLAN: Array<[string, string | null, string]> = [
  ["no subscription", null, "active"],
  ["free", "free", "active"],
  ["starter", "starter", "active"],
  ["growth", "growth", "active"],
  ["a cancelled agency plan", "agency", "canceled"],
];
const NOT_AGENCY_PRO: Array<[string, string | null, string]> = [
  ...NOT_AN_AGENCY_PLAN,
  ["agency", "agency", "active"],
  ["a cancelled agency_pro plan", "agency_pro", "canceled"],
];

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  const { inngest } = await import("@/lib/inngest/client");
  vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug, tier)
    VALUES (${ORG}, ${`plan-features-${RUN}`}, ${`Plan Features ${RUN}`}, ${`plan-features-${RUN}`}, 'agency')
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER}, ${`plan-features-${OWNER}`}, ${ORG}, ${`owner-${RUN}@example.com.au`}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG}, ${OWNER}, 'owner', now() + interval '7 days', now(), true)
  `;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND}, ${ORG}, 'Plan Features Brand', ${`features-${RUN}.example.com.au`}, 'tradies', 'au', ${["NSW:Bondi"]})
  `;
  await sql`
    INSERT INTO webhook_endpoints (id, organization_id, url, channel, events, signing_secret, is_active)
    VALUES (${ENDPOINT}, ${ORG}, 'https://hooks.example.com/existing', 'custom', ${["audit.completed"]}, 'whsec_test', true)
  `;
  await sql`
    INSERT INTO client_portal_invites (id, organization_id, brand_id, invite_token)
    VALUES (${INVITE}, ${ORG}, ${BRAND}, ${`features-${RUN}-${randomUUID()}`})
  `;
  currentUser.value = {
    id: OWNER,
    organizationId: ORG,
    role: "owner",
    name: "Owner",
    email: `owner-${RUN}@example.com.au`,
    organization: { id: ORG, name: "Plan Features", region: "au" },
  };
}, 60_000);

afterAll(async () => {
  for (const org of [ORG, ...otherOrgs]) {
    const tables = await sql<{ table_name: string }[]>`
      SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = 'public' AND c.column_name = 'organization_id'
        AND t.table_type = 'BASE TABLE' AND c.table_name <> 'organizations'
    `;
    let pending = tables.map((t) => t.table_name);
    for (let pass = 0; pass < 6 && pending.length > 0; pass++) {
      const failed: string[] = [];
      for (const table of pending) {
        try {
          await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${org}`;
        } catch {
          failed.push(table);
        }
      }
      pending = failed;
    }
    await sql`DELETE FROM organizations WHERE id = ${org}`;
  }
  await sql`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'team-invite:%'`;
  vi.restoreAllMocks();
  await sql.end();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("ok", { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each<[string, Call[], Array<[string, string | null, string]>, string, string[]]>([
  [
    "client portal invites",
    CLIENT_PORTAL,
    NOT_AN_AGENCY_PLAN,
    AGENCY_MESSAGE,
    ["agency", "agency_pro", "enterprise"],
  ],
  [
    "webhooks",
    WEBHOOKS,
    NOT_AN_AGENCY_PLAN,
    AGENCY_MESSAGE,
    ["agency", "agency_pro", "enterprise"],
  ],
  ["bulk operations", BULK, NOT_AGENCY_PRO, PRO_MESSAGE, ["agency_pro", "enterprise"]],
  ["GA4", GA4, NOT_AGENCY_PRO, PRO_MESSAGE, ["agency_pro", "enterprise"]],
])("%s", (_name, calls, deniedPlans, message, allowedPlans) => {
  describe.each(deniedPlans)("on %s", (_label, tier, status) => {
    beforeAll(() => setPlan(tier, status));

    it.each(
      calls.map((c) => [c.label, c] as const),
    )("%s is refused, saying which plan", async (_l, call) => {
      const res = await send(call);
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: string }).error).toBe(message);
    });
  });

  describe.each(allowedPlans)("on %s", (tier) => {
    beforeAll(() => setPlan(tier));

    it.each(calls.map((c) => [c.label, c] as const))("%s works", async (_l, call) => {
      expect((await send(call)).status).toBe(call.allowed);
    });
  });
});

describe("refused means nothing happened", () => {
  beforeAll(() => setPlan("growth"));

  it("no invite, endpoint or bulk operation is written, and no GA4 setting", async () => {
    const counts = async () => {
      const [row] = await sql<{ invites: number; endpoints: number; bulk: number }[]>`
        SELECT
          (SELECT count(*)::int FROM client_portal_invites WHERE organization_id = ${ORG}) AS invites,
          (SELECT count(*)::int FROM webhook_endpoints WHERE organization_id = ${ORG}) AS endpoints,
          (SELECT count(*)::int FROM bulk_operations WHERE organization_id = ${ORG}) AS bulk
      `;
      return row;
    };
    await sql`UPDATE organizations SET ga4_measurement_id = NULL WHERE id = ${ORG}`;
    const before = await counts();
    for (const call of [...CLIENT_PORTAL, ...WEBHOOKS, ...BULK, ...GA4]) await send(call);
    expect(await counts()).toEqual(before);
    const [org] = await sql<{ ga4_measurement_id: string | null }[]>`
      SELECT ga4_measurement_id FROM organizations WHERE id = ${ORG}
    `;
    expect(org.ga4_measurement_id).toBeNull();
  });
});

describe("off the plan you can still see and shut down what you already have", () => {
  beforeAll(() => setPlan("agency", "canceled"));

  it("client portal links can be listed and revoked", async () => {
    const list = await import("@/app/api/client-portal/invites/route");
    const listed = await list.GET();
    expect(listed.status).toBe(200);
    const { invites } = (await listed.json()) as { invites: Array<{ id: string }> };
    expect(invites.map((i) => i.id)).toContain(INVITE);
    const revoke = await import("@/app/api/client-portal/invites/[id]/route");
    const res = await revoke.DELETE(new Request("http://localhost/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: INVITE }),
    });
    expect(res.status).toBe(200);
  });

  it("a webhook endpoint can be deleted", async () => {
    const spare = randomUUID();
    await sql`
      INSERT INTO webhook_endpoints (id, organization_id, url, channel, events, signing_secret, is_active)
      VALUES (${spare}, ${ORG}, 'https://hooks.example.com/spare', 'custom', ${["audit.completed"]}, 'whsec_test', true)
    `;
    const route = await import("@/app/api/webhooks-config/[id]/route");
    const res = await route.DELETE(new Request("http://localhost/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: spare }),
    });
    expect(res.status).toBe(200);
  });
});

describe("the jobs", () => {
  type FnHandler = (ctx: { event: unknown; step: unknown }) => Promise<Record<string, unknown>>;
  const handler = (fn: unknown) => (fn as { fn: FnHandler }).fn;
  const events: unknown[] = [];
  const step = {
    run: async (_id: string, work: () => Promise<unknown>) => work(),
    sendEvent: async (_id: string, event: unknown) => {
      events.push(event);
    },
    sleep: async () => undefined,
  };
  const AUDIT = randomUUID();

  beforeAll(async () => {
    await sql`
      INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at, score_composite)
      VALUES (${AUDIT}, ${BRAND}, ${ORG}, 1, 'manual', 'complete', ${["chatgpt"]}, 1, 1, 1, 1, now() - interval '9 minutes', now(), '40.00')
    `;
    await sql`UPDATE organizations SET ga4_measurement_id = 'G-TEST', ga4_api_secret = 'secret' WHERE id = ${ORG}`;
  });

  beforeEach(() => {
    events.length = 0;
  });

  const ga4Event = { data: { auditId: AUDIT, brandId: BRAND, organizationId: ORG } };

  it("GA4 push: nothing goes to Google off the plan", async () => {
    const { ga4PushFn } = await import("@/inngest/functions/ga4-push");
    await setPlan("agency");
    await handler(ga4PushFn)({ event: ga4Event, step });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("GA4 push: on Agency Pro it pushes", async () => {
    const { ga4PushFn } = await import("@/inngest/functions/ga4-push");
    await setPlan("agency_pro");
    await handler(ga4PushFn)({ event: ga4Event, step });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  const fanoutEvent = {
    id: `evt-${RUN}`,
    name: "audit.complete",
    data: { auditId: AUDIT, brandId: BRAND, organizationId: ORG },
  };

  it("webhook fan-out: off the plan no endpoint is loaded", async () => {
    const { fanoutWebhooksFn } = await import("@/inngest/functions/fanout-webhooks");
    const { inngest } = await import("@/lib/inngest/client");
    await setPlan("growth");
    vi.mocked(inngest.send).mockClear();
    await handler(fanoutWebhooksFn)({ event: fanoutEvent, step });
    expect(events).toEqual([]);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("webhook fan-out: on Agency it reaches the endpoint", async () => {
    const { fanoutWebhooksFn } = await import("@/inngest/functions/fanout-webhooks");
    const { inngest } = await import("@/lib/inngest/client");
    await setPlan("agency");
    vi.mocked(inngest.send).mockClear();
    await handler(fanoutWebhooksFn)({ event: fanoutEvent, step });
    expect(events.length + vi.mocked(inngest.send).mock.calls.length).toBeGreaterThan(0);
  });

  const deliverEvent = {
    data: {
      endpointId: ENDPOINT,
      eventName: "audit.completed",
      payload: { eventName: "audit.completed" },
      organizationId: ORG,
    },
  };

  it("webhook delivery: one queued before a plan ended doesn't go out after", async () => {
    const { deliverWebhookFn } = await import("@/inngest/functions/deliver-webhook");
    await setPlan("agency", "canceled");
    const result = await handler(deliverWebhookFn)({ event: deliverEvent, step });
    expect(result.skipped).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("webhook delivery: on Agency it goes out", async () => {
    const { deliverWebhookFn } = await import("@/inngest/functions/deliver-webhook");
    await setPlan("agency");
    await handler(deliverWebhookFn)({ event: deliverEvent, step });
    expect(fetch).toHaveBeenCalled();
  });

  it("bulk re-audit: refuses to run off the plan, without marking the operation running", async () => {
    const { bulkReauditOrchestrate } = await import("@/inngest/functions/bulk-reaudit-orchestrate");
    const operation = randomUUID();
    await sql`
      INSERT INTO bulk_operations (id, organization_id, operation_type, status, total_brands)
      VALUES (${operation}, ${ORG}, 'reaudit', 'pending', 1)
    `;
    await setPlan("agency");
    const result = await handler(bulkReauditOrchestrate)({
      event: { data: { brandIds: [BRAND], organizationId: ORG, operationId: operation } },
      step,
    });
    expect(result).toMatchObject({ skipped: true, reason: "not_on_plan" });
    const [row] = await sql<
      { status: string }[]
    >`SELECT status FROM bulk_operations WHERE id = ${operation}`;
    expect(row.status).toBe("pending");
  });
});

describe("seats", () => {
  async function person(label: string): Promise<string> {
    const org = randomUUID();
    otherOrgs.push(org);
    const tag = org.slice(0, 8);
    await sql`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${org}, ${`seats-${tag}`}, ${`Seats ${tag}`}, ${`seats-${tag}`})
    `;
    const address = `${label}-${tag}@seats.example.com.au`;
    await sql`
      INSERT INTO users (clerk_user_id, organization_id, email, name, role)
      VALUES (${`seats-${tag}`}, ${org}, ${address}, ${label}, 'owner')
    `;
    return address;
  }

  async function invite(address: string) {
    const { POST } = await import("@/app/api/organizations/[orgId]/members/invite/route");
    const res = await POST(
      new Request(`http://localhost/api/organizations/${ORG}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, role: "viewer" }),
      }),
      { params: Promise.resolve({ orgId: ORG }) },
    );
    return { status: res.status, body: (await res.json()) as { error?: string; resent?: boolean } };
  }

  /** Only the owner left in the workspace. */
  async function resetMembers() {
    await sql`DELETE FROM org_members WHERE organization_id = ${ORG} AND user_id <> ${OWNER}`;
  }

  /** Fills seats with accepted members, on top of the owner. */
  async function addMembers(count: number) {
    for (let i = 0; i < count; i++) {
      const address = await person(`member${i}`);
      await sql`
        INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
        SELECT ${ORG}, id, 'viewer', now() + interval '7 days', now(), true FROM users WHERE email = ${address}
      `;
    }
  }

  beforeEach(async () => {
    await resetMembers();
  });

  it.each([
    ["no subscription", null, "active", 1, "Your plan includes 1 seat"],
    ["free", "free", "active", 1, "Your plan includes 1 seat"],
    ["starter", "starter", "active", 1, "Your plan includes 1 seat"],
    ["growth", "growth", "active", 1, "Your plan includes 1 seat"],
    ["a cancelled agency plan", "agency", "canceled", 1, "Your plan includes 1 seat"],
  ])("on %s, the owner is the only seat: inviting gets 409", async (_label, tier, status, _n, message) => {
    await setPlan(tier, status);
    const { status: code, body } = await invite(await person("invitee"));
    expect(code).toBe(409);
    expect(body.error).toBe(message);
  });

  it("agency has 5: the 5th seat can be invited, the 6th gets 409", async () => {
    await setPlan("agency");
    await addMembers(3); // with the owner: 4 used
    expect((await invite(await person("fifth"))).status).toBe(201);
    const refused = await invite(await person("sixth"));
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe("Your plan includes 5 seats");
  });

  it("a pending invite counts: 4 members and one invited is 5", async () => {
    await setPlan("agency");
    await addMembers(3);
    await invite(await person("pending"));
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM org_members WHERE organization_id = ${ORG} AND accepted_at IS NULL
    `;
    expect(count).toBe(1);
    expect((await invite(await person("over"))).status).toBe(409);
  });

  it("re-sending a pending invite at the limit takes no new seat, so it's allowed", async () => {
    await setPlan("agency");
    await addMembers(3);
    const pending = await person("pending");
    expect((await invite(pending)).status).toBe(201);
    const again = await invite(pending);
    expect(again.status).toBe(200);
    expect(again.body.resent).toBe(true);
  });

  it("a deactivated member frees the seat", async () => {
    await setPlan("agency");
    await addMembers(4);
    expect((await invite(await person("over"))).status).toBe(409);
    await sql`
      UPDATE org_members SET is_active = false
      WHERE id = (
        SELECT id FROM org_members
        WHERE organization_id = ${ORG} AND user_id <> ${OWNER} LIMIT 1
      )
    `;
    expect((await invite(await person("room"))).status).toBe(201);
  });

  it("agency_pro has 15, and enterprise no limit", async () => {
    await setPlan("agency_pro");
    await addMembers(14);
    expect((await invite(await person("over"))).status).toBe(409);
    await setPlan("enterprise");
    expect((await invite(await person("room"))).status).toBe(201);
  });

  it("two concurrent invites at limit-1: exactly one gets the seat", async () => {
    await setPlan("agency");
    await addMembers(3);
    const [a, b] = await Promise.all([person("race-a"), person("race-b")]);
    const results = await Promise.all([invite(a), invite(b)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM org_members
      WHERE organization_id = ${ORG} AND (is_active OR accepted_at IS NULL)
    `;
    expect(count).toBe(5);
  });
});
