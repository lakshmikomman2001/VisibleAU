/**
 * 3 Nov ("Stripe invoice handlers that work on any API version") -- from API version
 * 2025-03-31 an invoice has no `subscription`: it's at
 * parent.subscription_details.subscription. On such an endpoint invoice.paid and
 * invoice.payment_failed silently did nothing. Through the real webhook route (only
 * the signature check is a stand-in) and the local test database.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/stripe/verify-webhook", () => ({
  verifyStripeWebhook: vi.fn(async (req: Request) => JSON.parse(await req.text())),
}));

const RUN = randomUUID().slice(0, 8);
const ORG = randomUUID();
const OTHER_ORG = randomUUID();
const SUB = `sub_invoice_${RUN}`;
const OTHER_SUB = `sub_invoice_other_${RUN}`;

let sql: ReturnType<typeof postgres>;
let eventNumber = 0;
const eventIds: string[] = [];

async function deliver(type: string, object: unknown) {
  const { POST } = await import("@/app/api/webhooks/stripe/route");
  const id = `evt_invoice_${RUN}_${++eventNumber}`;
  eventIds.push(id);
  const res = await POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({ id, type, data: { object } }),
    }),
  );
  expect(res.status).toBe(200);
  return id;
}

async function setStatus(org: string, status: string) {
  await sql`UPDATE subscriptions SET status = ${status} WHERE organization_id = ${org}`;
}

async function statusOf(org: string) {
  const [row] = await sql<{ status: string }[]>`
    SELECT status FROM subscriptions WHERE organization_id = ${org}
  `;
  return row.status;
}

/** Each shape Stripe can send the subscription in. */
const SHAPES: Array<[string, (id: string) => Record<string, unknown>]> = [
  [
    "the newer shape, a string",
    (id) => ({ id: "in_new", parent: { subscription_details: { subscription: id } } }),
  ],
  [
    "the newer shape, expanded",
    (id) => ({ id: "in_new", parent: { subscription_details: { subscription: { id } } } }),
  ],
  ["the older shape", (id) => ({ id: "in_old", subscription: id })],
];

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  for (const [org, sub] of [
    [ORG, SUB],
    [OTHER_ORG, OTHER_SUB],
  ]) {
    const tag = org.slice(0, 8);
    await sql`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${org}, ${`invoice-${tag}`}, ${`Invoice ${tag}`}, ${`invoice-${tag}`})
    `;
    await sql`
      INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
      VALUES (${org}, ${`cus_${sub}`}, ${sub}, 'price_test', 'agency', 'monthly', 'active')
    `;
  }
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM processed_webhook_events WHERE stripe_event_id = ANY(${eventIds})`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ANY(${[ORG, OTHER_ORG]})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${[ORG, OTHER_ORG]})`;
  await sql.end();
});

beforeEach(async () => {
  await setStatus(ORG, "active");
  await setStatus(OTHER_ORG, "active");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(SHAPES)("%s", (_name, invoice) => {
  it("invoice.payment_failed marks the right subscription past_due, and no other", async () => {
    await deliver("invoice.payment_failed", invoice(SUB));
    expect(await statusOf(ORG)).toBe("past_due");
    expect(await statusOf(OTHER_ORG)).toBe("active");
  });

  it("invoice.paid brings the right subscription back to active, and no other", async () => {
    await setStatus(ORG, "past_due");
    await setStatus(OTHER_ORG, "past_due");
    await deliver("invoice.paid", invoice(SUB));
    expect(await statusOf(ORG)).toBe("active");
    expect(await statusOf(OTHER_ORG)).toBe("past_due");
  });

  it.each([
    "canceled",
    "incomplete_expired",
  ])("a %s subscription stays that way, whichever event comes late", async (ended) => {
    await setStatus(ORG, ended);
    await deliver("invoice.paid", invoice(SUB));
    expect(await statusOf(ORG)).toBe(ended);
    await deliver("invoice.payment_failed", invoice(SUB));
    expect(await statusOf(ORG)).toBe(ended);
  });

  it("doesn't warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await deliver("invoice.paid", invoice(SUB));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("an invoice with no subscription in either shape", () => {
  it.each([
    "invoice.paid",
    "invoice.payment_failed",
  ])("%s changes nothing, and warns with the event's id and type only", async (type) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const id = await deliver(type, {
      id: "in_none",
      parent: { subscription_details: null, quote_details: null },
      customer: "cus_secret",
      customer_email: "someone@example.com",
    });
    expect(await statusOf(ORG)).toBe("active");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toEqual({
      event: "stripe_invoice_without_subscription",
      stripeEventId: id,
      type,
    });
  });
});
