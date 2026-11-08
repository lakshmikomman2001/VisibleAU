/**
 * Mock-gate and retention follow-ups (9 Nov), part 8 -- Splice's sandbox subscription shows "Auto-cancels 23 Dec
 * 2026" in Stripe, but diag-0142 found cancel_at_period_end = false and the billing page said "Next renewal
 * 24 Nov 2026" with no warning: the handlers stored cancel_at_period_end and never Stripe's cancel_at, a
 * cancellation scheduled for a fixed date. They now store it (subscriptions.cancel_at, migration 0144):
 * - a canned customer.subscription.updated with cancel_at: the billing line reads "Plan ends 23 Dec 2026", and
 *   the plan stays until then;
 * - one without it: unchanged, "Next renewal 24 Nov 2026" (and a cancellation taken back is cleared);
 * - customer.subscription.deleted: the workspace drops to Free, as before.
 * Real webhook route and handlers, on the local test database; the signature check is mocked.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/stripe/verify-webhook", () => ({
  verifyStripeWebhook: vi.fn(async (req: Request) => JSON.parse(await req.text())),
}));

const PRICE: string =
  process.env.STRIPE_PRICE_AGENCY_PRO_MONTHLY ?? "price_cancel_at_test_agency_pro";
process.env.STRIPE_PRICE_AGENCY_PRO_MONTHLY = PRICE;

const RUN = randomUUID().slice(0, 8);
const ORG = randomUUID();
const SUB = `sub_1CancelAt${RUN}Splice`;
const OCT_24 = new Date("2026-10-24T03:12:00Z");
const NOV_24 = new Date("2026-11-24T03:12:00Z");
const DEC_23 = new Date("2026-12-23T03:12:00Z");
const NOV_9 = new Date("2026-11-09T09:00:00Z");
const unix = (date: Date) => date.getTime() / 1000;
const eventIds: string[] = [];
let sql: ReturnType<typeof postgres>;

function subscription(cancelAt: Date | null, status = "active") {
  return {
    id: SUB,
    object: "subscription",
    status,
    cancel_at_period_end: false,
    cancel_at: cancelAt ? unix(cancelAt) : null,
    items: {
      object: "list",
      data: [
        {
          id: `si_${RUN}`,
          price: { id: PRICE, recurring: { interval: "month" } },
          current_period_start: unix(OCT_24),
          current_period_end: unix(NOV_24),
        },
      ],
    },
  };
}

async function deliver(type: string, object: unknown): Promise<void> {
  const id = `evt_cancel_at_${RUN}_${eventIds.length + 1}`;
  eventIds.push(id);
  const { POST } = await import("@/app/api/webhooks/stripe/route");
  const res = await POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({ id, type, data: { object } }),
    }),
  );
  expect(res.status).toBe(200);
}

/** The row as the billing page reads it, and what the page and every plan gate make of it. */
async function billing() {
  const [row] = await sql<
    {
      tier: string;
      status: string;
      cancel_at_period_end: boolean;
      cancel_at: Date | null;
      current_period_start: Date | null;
      current_period_end: Date | null;
      stripe_subscription_id: string;
    }[]
  >`SELECT tier, status, cancel_at_period_end, cancel_at, current_period_start, current_period_end,
      stripe_subscription_id FROM subscriptions WHERE organization_id = ${ORG}`;
  const { renewalLine } = await import("@/lib/pricing/renewal");
  const { tierOfSubscription } = await import("@/lib/pricing/effective-tier");
  const { formatInOrgTimezone } = await import("@/lib/platform/org-timezone");
  const plan = {
    tier: row.tier,
    status: row.status,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    cancelAt: row.cancel_at,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
  };
  const line = renewalLine(
    { ...plan, stripeSubscriptionId: row.stripe_subscription_id },
    (date) => formatInOrgTimezone(date, undefined, "d MMM yyyy"),
    NOV_9,
  );
  return {
    cancelAt: row.cancel_at,
    line: `${line.label} ${line.value}`,
    tier: tierOfSubscription(plan, NOV_9),
  };
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`cancel-at-${ORG}`}, 'Cancel At Agency', ${`cancel-at-${ORG}`})
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
      tier, billing_interval, status, current_period_start, current_period_end)
    VALUES (${ORG}, ${`cus_cancel_at_${RUN}`}, ${SUB}, ${PRICE}, 'agency_pro', 'monthly', 'active', ${OCT_24}, ${NOV_24})
  `;
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM processed_webhook_events WHERE stripe_event_id = ANY(${eventIds})`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  await sql.end();
});

describe("Stripe's scheduled cancellation date", () => {
  it("an update without cancel_at: unchanged, the next renewal", async () => {
    await deliver("customer.subscription.updated", subscription(null));
    expect(await billing()).toEqual({
      cancelAt: null,
      line: "Next renewal 24 Nov 2026",
      tier: "agency_pro",
    });
  });

  it("an update with cancel_at: stored, 'Plan ends 23 Dec 2026', and the plan stays until then", async () => {
    await deliver("customer.subscription.updated", subscription(DEC_23));
    expect(await billing()).toEqual({
      cancelAt: DEC_23,
      line: "Plan ends 23 Dec 2026",
      tier: "agency_pro",
    });
  });

  it("a cancellation taken back in Stripe is cleared: the next renewal again", async () => {
    await deliver("customer.subscription.updated", subscription(null));
    expect((await billing()).line).toBe("Next renewal 24 Nov 2026");
  });

  it("customer.subscription.deleted: the workspace drops to Free, as before", async () => {
    await deliver("customer.subscription.updated", subscription(DEC_23));
    await deliver("customer.subscription.deleted", subscription(DEC_23, "canceled"));
    expect((await billing()).tier).toBe("free");
  });
});
