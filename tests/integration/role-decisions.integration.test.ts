/**
 * Follow-ups from d247ba7..f13411d, part 1 -- Sri's role decisions (8 Nov), on the server, through the real
 * routes against the test database. Only the signed-in user is stubbed; each profile's own role is
 * "member", so its membership's role is the one that counts.
 * - 3: webhooks, GA4 and client-portal invites are an owner's or admin's; an analyst is refused with the
 *   reason and nothing is made. A list any role can read never carries a webhook's signing secret, and only
 *   a role that may share a portal is given its link.
 * - 4: the bulk export makes nothing (it reads finished audits into a CSV), so it's viewing reports: a
 *   viewer may.
 * - 5: the workspace's email settings are an owner's or admin's; anyone can stop the digest sent to them.
 * - 6: marking the workspace's onboarding complete is an owner's or admin's; a person ending their own tour
 *   isn't, and it ends only theirs.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OrgRole } from "@/lib/governance/permissions";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { currentUserMock, sendMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  sendMock: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: currentUserMock }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: sendMock } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const PEOPLE: Record<OrgRole, string> = {
  owner: randomUUID(),
  admin: randomUUID(),
  analyst: randomUUID(),
  viewer: randomUUID(),
};
const emailOf = (role: OrgRole) => `${role}@role-decisions.example.com.au`;
const BASE = "http://localhost:3000";
const REFUSED_INTEGRATIONS = "Only an owner or admin can change integrations.";

let sql: ReturnType<typeof postgres>;

function signInAs(role: OrgRole) {
  currentUserMock.mockResolvedValue({
    id: PEOPLE[role],
    organizationId: ORG_ID,
    email: emailOf(role),
    name: role,
    role: "member",
    organization: { id: ORG_ID, name: "Role Decisions Org", metadata: {} },
  });
}

type Handler = (req: Request) => Promise<Response>;

/** Each route's module, by a literal path (so the alias resolves). */
const ROUTES: Record<string, () => Promise<Record<string, unknown>>> = {
  "webhooks-config": () => import("@/app/api/webhooks-config/route"),
  "agency/ga4-config": () => import("@/app/api/agency/ga4-config/route"),
  "client-portal/invites": () => import("@/app/api/client-portal/invites/route"),
  "agency/bulk-export": () => import("@/app/api/agency/bulk-export/route"),
  "notification-preferences": () => import("@/app/api/notification-preferences/route"),
  "notification-preferences/stop-my-digest": () =>
    import("@/app/api/notification-preferences/stop-my-digest/route"),
  "onboarding/complete": () => import("@/app/api/onboarding/complete/route"),
  "onboarding/tour-complete": () => import("@/app/api/onboarding/tour-complete/route"),
};

async function call(route: string, method: string, body?: unknown) {
  const mod = await ROUTES[route]();
  const handler = mod[method] as Handler | undefined;
  if (!handler) return { status: 404, body: {} as Record<string, unknown>, text: "" };
  const res = await handler(
    new Request(`${BASE}/api/${route}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // A CSV.
  }
  return { status: res.status, body: parsed, text };
}

const count = async (table: "webhook_endpoints" | "client_portal_invites") => {
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM ${sql(table)} WHERE organization_id = ${ORG_ID}
  `;
  return n;
};

async function digest() {
  const [row] = await sql<{ weekly_digest: boolean; digest_email: string }[]>`
    SELECT weekly_digest, digest_email FROM notification_preferences WHERE organization_id = ${ORG_ID}
  `;
  return row;
}

async function setDigest(to: string, on = true) {
  await sql`DELETE FROM notification_preferences WHERE organization_id = ${ORG_ID}`;
  await sql`
    INSERT INTO notification_preferences (organization_id, digest_email, weekly_digest)
    VALUES (${ORG_ID}, ${to}, ${on})
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`role-dec-${ORG_ID}`}, 'Role Decisions Org', ${`role-dec-${ORG_ID}`})
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test', 'agency_pro', 'monthly', 'active')
  `;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Decisions Co', ${`${BRAND_ID.slice(0, 8)}.example.com.au`}, 'tradies', 'au', ARRAY[]::text[])
  `;
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'manual', 'complete', ${["chatgpt"]}, 1, 10, 1, 10, now() - interval '1 day', now() - interval '1 day')
  `;
  for (const [role, id] of Object.entries(PEOPLE) as [OrgRole, string][]) {
    await sql`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${id}, ${`role-dec-${id}`}, ${ORG_ID}, ${emailOf(role)}, ${role}, 'member')
    `;
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${ORG_ID}, ${id}, ${role}, now(), now(), true)
    `;
  }
}, 60000);

afterAll(async () => {
  await sql`DELETE FROM client_portal_invites WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM webhook_endpoints WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM bulk_operations WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM notification_preferences WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

describe("decision 3: webhooks, GA4 and client portals are an owner's or admin's", () => {
  it("webhooks: an analyst is refused, saying who may, and nothing is made; an admin adds one", async () => {
    const endpoint = {
      url: "https://hooks.example.com.au/visibility",
      channel: "custom",
      events: ["audit.completed"],
    };
    signInAs("analyst");
    const refused = await call("webhooks-config", "POST", endpoint);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe(REFUSED_INTEGRATIONS);
    expect(await count("webhook_endpoints")).toBe(0);

    signInAs("admin");
    const made = await call("webhooks-config", "POST", endpoint);
    expect(made.status).toBe(200);
    expect(String(made.body.signingSecret)).toMatch(/^whsec_/);
    expect(await count("webhook_endpoints")).toBe(1);
  });

  it("the endpoint list never carries the signing secret, for any role", async () => {
    for (const role of ["viewer", "owner"] as const) {
      signInAs(role);
      const { status, body } = await call("webhooks-config", "GET");
      expect(status).toBe(200);
      const endpoints = body.endpoints as Record<string, unknown>[];
      expect(endpoints).toHaveLength(1);
      expect(endpoints[0]).not.toHaveProperty("signingSecret");
    }
  });

  it("GA4: an analyst is refused and nothing is saved; an admin saves it", async () => {
    const ga4 = { ga4MeasurementId: "G-TEST123", ga4ApiSecret: "secret-value" };
    signInAs("analyst");
    const refused = await call("agency/ga4-config", "PATCH", ga4);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe(REFUSED_INTEGRATIONS);
    const [before] = await sql<{ ga4_measurement_id: string | null }[]>`
      SELECT ga4_measurement_id FROM organizations WHERE id = ${ORG_ID}
    `;
    expect(before.ga4_measurement_id).toBeNull();

    signInAs("admin");
    expect((await call("agency/ga4-config", "PATCH", ga4)).status).toBe(200);
    const [after] = await sql<{ ga4_measurement_id: string | null }[]>`
      SELECT ga4_measurement_id FROM organizations WHERE id = ${ORG_ID}
    `;
    expect(after.ga4_measurement_id).toBe("G-TEST123");
  });

  it("client-portal invites: an analyst is refused and nothing is made; an admin makes one", async () => {
    signInAs("analyst");
    const refused = await call("client-portal/invites", "POST", { brandId: BRAND_ID });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe(REFUSED_INTEGRATIONS);
    expect(await count("client_portal_invites")).toBe(0);

    signInAs("admin");
    expect((await call("client-portal/invites", "POST", { brandId: BRAND_ID })).status).toBe(201);
    expect(await count("client_portal_invites")).toBe(1);
  });

  it("the portal list gives the link's token only to a role that may share it", async () => {
    signInAs("analyst");
    const analyst = await call("client-portal/invites", "GET");
    expect((analyst.body.invites as Record<string, unknown>[])[0].inviteToken).toBeNull();
    signInAs("admin");
    const admin = await call("client-portal/invites", "GET");
    expect(String((admin.body.invites as Record<string, unknown>[])[0].inviteToken)).not.toBe("");
    expect((admin.body.invites as Record<string, unknown>[])[0].inviteToken).not.toBeNull();
  });
});

describe("decision 4: the bulk export makes nothing, so a viewer may download it", () => {
  it("a viewer gets the CSV of finished audits; nothing is sent anywhere", async () => {
    signInAs("viewer");
    const { status, text } = await call("agency/bulk-export", "POST", { brandIds: [BRAND_ID] });
    expect(status).toBe(200);
    expect(text.split("\n")[0]).toMatch(/^Brand,Domain,Vertical,Audit Number/);
    expect(text).toContain("Decisions Co");
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("decision 5: the workspace's email settings are an owner's or admin's", () => {
  it("an analyst can't change where the digest goes: 403, and it still goes where it did", async () => {
    await setDigest(emailOf("owner"));
    signInAs("analyst");
    const { status, body } = await call("notification-preferences", "PATCH", {
      digestEmail: "someone@outside.example.com",
    });
    expect(status).toBe(403);
    expect(body.error).toBe("Only an owner or admin can change the workspace's email settings.");
    expect(await digest()).toEqual({ weekly_digest: true, digest_email: emailOf("owner") });
  });

  it("an analyst can't switch an alert off for everyone either", async () => {
    signInAs("analyst");
    expect((await call("notification-preferences", "PATCH", { emailOnDrift: false })).status).toBe(
      403,
    );
  });

  it("an analyst can stop the digest sent to them", async () => {
    await setDigest(emailOf("analyst"));
    signInAs("analyst");
    const read = await call("notification-preferences", "GET");
    expect(read.body.digestToYou).toBe(true);
    const { status } = await call("notification-preferences/stop-my-digest", "POST");
    expect(status).toBe(200);
    expect(await digest()).toEqual({ weekly_digest: false, digest_email: emailOf("analyst") });
  });

  it("but not one sent to someone else: 403, still on", async () => {
    await setDigest(emailOf("owner"));
    signInAs("analyst");
    const { status, body } = await call("notification-preferences/stop-my-digest", "POST");
    expect(status).toBe(403);
    expect(String(body.error)).toContain("goes to another address");
    expect(await digest()).toEqual({ weekly_digest: true, digest_email: emailOf("owner") });
  });

  it("an admin changes them", async () => {
    signInAs("admin");
    const { status } = await call("notification-preferences", "PATCH", {
      digestEmail: emailOf("admin"),
    });
    expect(status).toBe(200);
    expect((await digest()).digest_email).toBe(emailOf("admin"));
  });
});

describe("decision 6: marking the workspace's onboarding complete is an owner's or admin's", () => {
  const onboardingComplete = async () => {
    const [row] = await sql<{ onboarding_complete: boolean }[]>`
      SELECT onboarding_complete FROM organizations WHERE id = ${ORG_ID}
    `;
    return row.onboarding_complete;
  };

  it("a viewer can't: 403, and it isn't marked", async () => {
    signInAs("viewer");
    const { status, body } = await call("onboarding/complete", "POST");
    expect(status).toBe(403);
    expect(body.error).toBe("Only an owner or admin can mark the workspace's onboarding complete.");
    expect(await onboardingComplete()).toBe(false);
  });

  it("an admin can", async () => {
    signInAs("admin");
    expect((await call("onboarding/complete", "POST")).status).toBe(200);
    expect(await onboardingComplete()).toBe(true);
  });

  it("a viewer ends their own tour, and only theirs", async () => {
    signInAs("viewer");
    expect((await call("onboarding/tour-complete", "POST")).status).toBe(200);
    const [{ metadata }] = await sql<{ metadata: Record<string, unknown> }[]>`
      SELECT metadata FROM organizations WHERE id = ${ORG_ID}
    `;
    const { isNoticeDismissed, PRODUCT_TOUR_NOTICE } = await import(
      "@/lib/onboarding/dismissed-notices"
    );
    expect(metadata.productTourComplete).toBeUndefined();
    expect(isNoticeDismissed(metadata, PEOPLE.viewer, PRODUCT_TOUR_NOTICE)).toBe(true);
    expect(isNoticeDismissed(metadata, PEOPLE.owner, PRODUCT_TOUR_NOTICE)).toBe(false);
  });
});
