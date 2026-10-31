/**
 * Task 15, item 2 -- who gets a notification email, on a real database.
 *
 * Preferences are per org (notification_preferences). The org's switch
 * for the email type decides whether it goes out; if it does, it goes to
 * the org's owner and admins -- never analysts or viewers, never an
 * unaccepted invite, never the provisioning placeholder address, and
 * (in production) never RESEND_DEV_RECIPIENT. Audit complete is on
 * until the org switches it off (A1, Sri 31 Oct): no row means on, a
 * stored false means off.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { resendSend } = vi.hoisted(() => ({ resendSend: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const OWNER = "owner@recipients-test.example.com.au";
const ADMIN = "admin@recipients-test.example.com.au";
const VIEWER = "viewer@recipients-test.example.com.au";
const PENDING_ADMIN = "pending-admin@recipients-test.example.com.au";
const DEV_INBOX = "dev-inbox@example.com";

let client: ReturnType<typeof postgres>;
const step = { run: (_name: string, fn: () => unknown) => fn() };

async function addUser(email: string, role: string): Promise<string> {
  const id = randomUUID();
  await client`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${id}, ${`recipients-${id}`}, ${ORG_ID}, ${email}, 'Test', ${role})
  `;
  return id;
}

async function addMember(userId: string, role: string, accepted: boolean) {
  await client`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${userId}, ${role}, now() + interval '7 days', ${accepted ? new Date() : null}, ${accepted})
  `;
}

async function setPreferences(values: {
  emailOnAuditComplete?: boolean;
  emailOnHallucination?: boolean;
}) {
  await client`DELETE FROM notification_preferences WHERE organization_id = ${ORG_ID}`;
  await client`
    INSERT INTO notification_preferences (organization_id, digest_email, email_on_audit_complete, email_on_hallucination)
    VALUES (${ORG_ID}, 'digest@recipients-test.example.com.au',
      ${values.emailOnAuditComplete ?? false}, ${values.emailOnHallucination ?? true})
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`recipients-${ORG_ID}`}, 'Recipients Test Org', ${`recipients-org-${ORG_ID}`})
  `;
  await addUser(OWNER, "owner");
  await addUser("pending@sync.local", "owner");
  await addMember(await addUser(ADMIN, "member"), "admin", true);
  await addMember(await addUser(VIEWER, "member"), "viewer", true);
  await addMember(await addUser(PENDING_ADMIN, "member"), "admin", false);

  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Recipients Co', 'recipients.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 7, 'manual', 'complete', ${["chatgpt"]}, 1, 10, 1, 10, now() - interval '5 minutes', now())
  `;
}, 60000);

afterEach(() => {
  vi.unstubAllEnvs();
  resendSend.mockReset();
});

afterAll(async () => {
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM notification_preferences WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("resolveNotificationRecipients", () => {
  it("with nothing saved, audit complete is on: the owner and admins only", async () => {
    await client`DELETE FROM notification_preferences WHERE organization_id = ${ORG_ID}`;
    const { resolveNotificationRecipients } = await import("@/lib/email/recipients");
    await expect(resolveNotificationRecipients(ORG_ID, "audit_complete")).resolves.toEqual({
      enabled: true,
      recipients: [ADMIN, OWNER],
    });
  });

  it("a saved false switches audit complete off: nobody", async () => {
    await setPreferences({ emailOnAuditComplete: false });
    const { resolveNotificationRecipients } = await import("@/lib/email/recipients");
    await expect(resolveNotificationRecipients(ORG_ID, "audit_complete")).resolves.toEqual({
      enabled: false,
      recipients: [],
    });
  });

  it("with nothing saved, an on-by-default alert goes to the owner and admins only", async () => {
    await client`DELETE FROM notification_preferences WHERE organization_id = ${ORG_ID}`;
    const { resolveNotificationRecipients } = await import("@/lib/email/recipients");
    await expect(resolveNotificationRecipients(ORG_ID, "hallucination")).resolves.toEqual({
      enabled: true,
      recipients: [ADMIN, OWNER],
    });
  });

  it("switched on: owner and accepted admins -- not viewers, unaccepted invites or the placeholder", async () => {
    await setPreferences({ emailOnAuditComplete: true });
    const { resolveNotificationRecipients } = await import("@/lib/email/recipients");
    const { recipients } = await resolveNotificationRecipients(ORG_ID, "audit_complete");
    expect(recipients).toEqual([ADMIN, OWNER]);
    expect(recipients).not.toContain(VIEWER);
    expect(recipients).not.toContain(PENDING_ADMIN);
    expect(recipients).not.toContain("pending@sync.local");
  });

  it("switched off: nobody", async () => {
    await setPreferences({ emailOnHallucination: false });
    const { resolveNotificationRecipients } = await import("@/lib/email/recipients");
    await expect(resolveNotificationRecipients(ORG_ID, "hallucination")).resolves.toEqual({
      enabled: false,
      recipients: [],
    });
  });
});

describe("the audit-complete email (Inngest function)", () => {
  type Handler = (ctx: {
    event: { data: { auditId: string } };
    step: typeof step;
  }) => Promise<unknown>;

  function productionEnv() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "Vunnara <audits@vunnara.com.au>");
    vi.stubEnv("RESEND_DEV_RECIPIENT", DEV_INBOX);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.vunnara.com.au");
  }

  it("goes to opted-in owners and admins only, never the dev address, one idempotent send each", async () => {
    productionEnv();
    await setPreferences({ emailOnAuditComplete: true });
    resendSend.mockResolvedValue({ data: { id: "em_1" }, error: null, headers: null });
    const { sendAuditCompleteEmail } = await import(
      "@/inngest/functions/send-audit-complete-email"
    );

    await (sendAuditCompleteEmail as unknown as { fn: Handler }).fn({
      event: { data: { auditId: AUDIT_ID } },
      step,
    });

    const sentTo = resendSend.mock.calls.map((c) => c[0].to);
    expect(sentTo.sort()).toEqual([ADMIN, OWNER]);
    expect(sentTo).not.toContain(DEV_INBOX);
    expect(sentTo).not.toContain("dev@visibleau.local");
    const keys = resendSend.mock.calls.map((c) => c[1]?.idempotencyKey);
    expect(new Set(keys).size).toBe(2);
    for (const key of keys) expect(key).toMatch(new RegExp(`^audit-complete:${AUDIT_ID}:`));
  });

  it("with nothing saved, goes to the owner and admins (on by default)", async () => {
    productionEnv();
    await client`DELETE FROM notification_preferences WHERE organization_id = ${ORG_ID}`;
    resendSend.mockResolvedValue({ data: { id: "em_2" }, error: null, headers: null });
    const { sendAuditCompleteEmail } = await import(
      "@/inngest/functions/send-audit-complete-email"
    );

    await (sendAuditCompleteEmail as unknown as { fn: Handler }).fn({
      event: { data: { auditId: AUDIT_ID } },
      step,
    });

    const sentTo = resendSend.mock.calls.map((c) => c[0].to);
    expect(sentTo.sort()).toEqual([ADMIN, OWNER]);
    expect(sentTo).not.toContain(VIEWER);
    expect(sentTo).not.toContain(PENDING_ADMIN);
  });

  it("sends nothing when the org has switched it off (a saved false)", async () => {
    productionEnv();
    await setPreferences({ emailOnAuditComplete: false });
    const { sendAuditCompleteEmail } = await import(
      "@/inngest/functions/send-audit-complete-email"
    );

    await (sendAuditCompleteEmail as unknown as { fn: Handler }).fn({
      event: { data: { auditId: AUDIT_ID } },
      step,
    });
    expect(resendSend).not.toHaveBeenCalled();
  });
});
