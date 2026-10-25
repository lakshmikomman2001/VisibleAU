/**
 * Task 15, item 5 -- a replayed Inngest step never sends an email twice.
 *
 * The Resend stand-in below honours Idempotency-Key the way Resend does:
 * a second request with a key it has seen returns the first email's id
 * and delivers nothing new; a request without a key always delivers. So
 * the delivery count is what a recipient's inbox would see.
 *
 * Covers the audit-complete function run twice (Inngest replaying it),
 * a step that failed halfway and was retried, an alert sent twice from
 * the same step, and the weekly digest sent twice on the same day.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const resend = vi.hoisted(() => {
  const delivered: Array<{ to: string; subject: string }> = [];
  const idsByKey = new Map<string, string>();
  const state = { failFor: null as string | null };
  const send = vi.fn(
    async (payload: { to: string; subject: string }, options?: { idempotencyKey?: string }) => {
      const key = options?.idempotencyKey;
      if (key && idsByKey.has(key)) {
        return { data: { id: idsByKey.get(key) as string }, error: null, headers: null };
      }
      if (state.failFor === payload.to) {
        state.failFor = null;
        return {
          data: null,
          error: { name: "internal_server_error", message: "try again", statusCode: 500 },
          headers: null,
        };
      }
      const id = `em_${delivered.length + 1}`;
      delivered.push({ to: payload.to, subject: payload.subject });
      if (key) idsByKey.set(key, id);
      return { data: { id }, error: null, headers: null };
    },
  );
  return { delivered, idsByKey, state, send };
});
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resend.send };
  },
}));

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const OWNER = "owner@replay-test.example.com.au";
const ADMIN = "admin@replay-test.example.com.au";
const DIGEST = "digest@replay-test.example.com.au";

let client: ReturnType<typeof postgres>;
const step = { run: (_name: string, fn: () => unknown) => fn() };
type Handler = (ctx: {
  event: { data: { auditId: string } };
  step: typeof step;
}) => Promise<unknown>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`replay-${ORG_ID}`}, 'Replay Test Org', ${`replay-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO notification_preferences (organization_id, digest_email, email_on_audit_complete)
    VALUES (${ORG_ID}, ${DIGEST}, true)
  `;
  const adminId = randomUUID();
  await client`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role) VALUES
      (${randomUUID()}, ${`replay-owner-${ORG_ID}`}, ${ORG_ID}, ${OWNER}, 'Owner', 'owner'),
      (${adminId}, ${`replay-admin-${ORG_ID}`}, ${ORG_ID}, ${ADMIN}, 'Admin', 'member')
  `;
  await client`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${adminId}, 'admin', now(), now(), true)
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Replay Co', 'replay.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 3, 'manual', 'complete', ${["chatgpt"]}, 1, 10, 1, 10, now() - interval '5 minutes', now())
  `;
}, 60000);

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "Vunnara <audits@vunnara.com.au>");
  vi.stubEnv("RESEND_DEV_RECIPIENT", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.vunnara.com.au");
  resend.delivered.length = 0;
  resend.idsByKey.clear();
  resend.state.failFor = null;
  resend.send.mockClear();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM notification_preferences WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM org_members WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM users WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function runAuditComplete() {
  const { sendAuditCompleteEmail } = await import("@/inngest/functions/send-audit-complete-email");
  return (sendAuditCompleteEmail as unknown as { fn: Handler }).fn({
    event: { data: { auditId: AUDIT_ID } },
    step,
  });
}

describe("a replayed Inngest step never sends twice", () => {
  it("the audit-complete function run twice delivers one email per recipient", async () => {
    await runAuditComplete();
    await runAuditComplete();

    expect(resend.send).toHaveBeenCalledTimes(4);
    expect(resend.delivered.map((d) => d.to).sort()).toEqual([ADMIN, OWNER]);
  });

  it("a send step that failed halfway and was retried sends only the email that hadn't gone", async () => {
    // Recipients go in address order, so the admin's goes out and then
    // the owner's fails, failing the step.
    resend.state.failFor = OWNER;
    await expect(runAuditComplete()).rejects.toThrow(/Email not sent \(provider_error\)/);
    expect(resend.delivered.map((d) => d.to)).toEqual([ADMIN]);

    await runAuditComplete(); // Inngest's retry of the step
    expect(resend.delivered.map((d) => d.to).sort()).toEqual([ADMIN, OWNER]);
  });

  it("an alert sent twice from the same step reaches each recipient once", async () => {
    const { sendHallucinationAlert } = await import("@/lib/communication/alert-composer");
    const alert = {
      organizationId: ORG_ID,
      idempotencyBase: `hallucination:${AUDIT_ID}`,
      brandName: "Replay Co",
      auditNumber: 3,
      criticalCount: 1,
      warningCount: 0,
      reviewUrl: "https://app.vunnara.com.au/brands/b/trust/hallucinations",
    };
    await sendHallucinationAlert(alert);
    await sendHallucinationAlert(alert);
    expect(resend.delivered.map((d) => d.to).sort()).toEqual([ADMIN, OWNER]);
  });

  it("the weekly digest sent twice on the same day arrives once", async () => {
    const { sendDigestEmail } = await import("@/lib/digest/send");
    const { weeklyDigestEmail } = await import("@/lib/email/templates/weekly-digest");
    const email = weeklyDigestEmail({ date: new Date(), brands: [] });
    await sendDigestEmail(DIGEST, email, ORG_ID);
    await sendDigestEmail(DIGEST, email, ORG_ID);
    expect(resend.delivered.map((d) => d.to)).toEqual([DIGEST]);
  });
});
