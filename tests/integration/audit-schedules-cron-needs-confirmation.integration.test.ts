/**
 * Vunnara Build 1 follow-up (entry-point check) -- real-DB proof that
 * the nightly schedule cron pauses cleanly (status = 'needs_
 * confirmation') for an unconfirmed brand, creates no audit row, and
 * -- because the next cron tick's own WHERE status = 'active' filter
 * then excludes this schedule -- never fires again for the same brand
 * (the "at most one notification" requirement, proven by re-running
 * the cron a second time and confirming it's no longer picked up).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const SCHEDULE_ID = randomUUID();

let client: ReturnType<typeof postgres>;
const step = { run: (_name: string, fn: () => unknown) => fn() };

const sendMock = vi.fn().mockResolvedValue({ id: "local-1" });
vi.mock("@/lib/email/client", () => ({ resend: { emails: { send: sendMock } } }));

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`cron-confirm-${ORG_ID}`}, 'Cron Confirm Test Org', ${`cron-confirm-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO notification_preferences (organization_id, digest_email)
    VALUES (${ORG_ID}, 'owner@cron-confirm-test.example.com.au')
  `;
  // checkQuota() fails closed (returns false) with no subscription
  // row at all -- a real subscription, however minimal, is needed so
  // THIS test's own gate (not the pre-existing quota check) is the one
  // that fires.
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_growth', 'growth', 'month', 'active')
  `;
  // Unconfirmed brand -- classification_status defaults to 'pending',
  // location_mode defaults to NULL.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Nightly Co', 'nightlyco.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audit_schedules (id, organization_id, brand_id, frequency, status, next_run_at)
    VALUES (${SCHEDULE_ID}, ${ORG_ID}, ${BRAND_ID}, 'daily', 'active', now() - interval '1 hour')
  `;
});

afterAll(async () => {
  await client`DELETE FROM audit_schedules WHERE id = ${SCHEDULE_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM notification_preferences WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("audit-schedules-cron.ts -- an unconfirmed brand's schedule pauses cleanly, notifies once, never loops", () => {
  it("pauses the schedule, creates no audit row, and sends exactly one notification", async () => {
    const { auditSchedulesCron } = await import("@/inngest/functions/audit-schedules-cron");
    type Handler = (ctx: { step: typeof step }) => Promise<unknown>;

    await (auditSchedulesCron as unknown as { fn: Handler }).fn({ step });

    const [schedule] = await client<{ status: string; paused_reason: string | null }[]>`
      SELECT status, paused_reason FROM audit_schedules WHERE id = ${SCHEDULE_ID}
    `;
    expect(schedule.status).toBe("needs_confirmation");
    expect(schedule.paused_reason).toMatch(/confirm/i);

    const audits = await client`SELECT id FROM audits WHERE brand_id = ${BRAND_ID}`;
    expect(audits.length).toBe(0);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].to).toBe("owner@cron-confirm-test.example.com.au");
  });

  it("never fires again for this brand on a second cron tick (the 'at most one' guarantee)", async () => {
    sendMock.mockClear();
    const { auditSchedulesCron } = await import("@/inngest/functions/audit-schedules-cron");
    type Handler = (ctx: { step: typeof step }) => Promise<unknown>;

    await (auditSchedulesCron as unknown as { fn: Handler }).fn({ step });

    // The schedule is no longer 'active', so the cron's own WHERE
    // status = 'active' filter excludes it from this run entirely --
    // no second notification, no new audit, no change at all.
    expect(sendMock).not.toHaveBeenCalled();
    const audits = await client`SELECT id FROM audits WHERE brand_id = ${BRAND_ID}`;
    expect(audits.length).toBe(0);
  });
});
