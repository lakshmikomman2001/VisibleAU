/**
 * Brand-feature locks and pricing claims (8 Nov), part 6 -- Stripe renewals and the stored period. diag-0139
 * showed Splice's row (Agency Pro, active) with 24 Sep 2026 as both ends after its 24 Oct renewal: the code
 * before 3 Nov read the period off the subscription, which API versions from 2025-03-31 no longer have, so
 * checkout stored its own time as both ends and the renewal's event left them as they were.
 *
 * Canned events in the shape of the pinned API version (2026-05-27.dahlia: the period on each item) and the
 * older one (on the subscription; a webhook endpoint keeps the version it was set to), delivered through the
 * real webhook route; checkout and the downgrade route with Stripe's API answers canned. Only the signature
 * check, Stripe's API and the signed-in user stand in.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { retrieveMock, updateMock, currentUserMock } = vi.hoisted(() => ({
  retrieveMock: vi.fn(),
  updateMock: vi.fn(),
  currentUserMock: vi.fn(),
}));
vi.mock("@/lib/stripe/verify-webhook", () => ({
  verifyStripeWebhook: vi.fn(async (req: Request) => JSON.parse(await req.text())),
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ subscriptions: { retrieve: retrieveMock, update: updateMock } }),
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: currentUserMock }));

// The price map reads this when it's first imported, below.
const PRICE: string = process.env.STRIPE_PRICE_AGENCY_PRO_MONTHLY ?? "price_period_test_agency_pro";
process.env.STRIPE_PRICE_AGENCY_PRO_MONTHLY = PRICE;

const RUN = randomUUID().slice(0, 8);
const ORG = randomUUID();
const CHECKOUT_ORG = randomUUID();
const OWNER = randomUUID();
const SUB = `sub_1Period${RUN}Renewal`;
const CHECKOUT_SUB = `sub_1Period${RUN}Checkout`;

const SEP_24 = new Date("2026-09-24T03:12:00Z");
const OCT_24 = new Date("2026-10-24T03:12:00Z");
const NOV_24 = new Date("2026-11-24T03:12:00Z");
const unix = (date: Date) => date.getTime() / 1000;

let sql: ReturnType<typeof postgres>;
let eventNumber = 0;
const eventIds: string[] = [];

interface Period {
  start?: Date;
  end?: Date;
}

/** A subscription as the pinned API version gives it: the period on the item. */
function pinnedShape(id: string, period: Period, extra: Record<string, unknown> = {}) {
  return {
    id,
    object: "subscription",
    status: "active",
    cancel_at_period_end: false,
    items: {
      object: "list",
      data: [
        {
          id: `si_${RUN}`,
          price: { id: PRICE, recurring: { interval: "month" } },
          ...(period.start && { current_period_start: unix(period.start) }),
          ...(period.end && { current_period_end: unix(period.end) }),
        },
      ],
    },
    ...extra,
  };
}

/** The older shape: the period on the subscription, none on the item. */
function olderShape(id: string, period: Period) {
  return {
    id,
    object: "subscription",
    status: "active",
    cancel_at_period_end: false,
    ...(period.start && { current_period_start: unix(period.start) }),
    ...(period.end && { current_period_end: unix(period.end) }),
    items: {
      object: "list",
      data: [{ id: `si_${RUN}`, price: { id: PRICE, recurring: { interval: "month" } } }],
    },
  };
}

function nextEventId() {
  const id = `evt_period_${RUN}_${++eventNumber}`;
  eventIds.push(id);
  return id;
}

async function deliver(type: string, object: unknown, id = nextEventId()) {
  const { POST } = await import("@/app/api/webhooks/stripe/route");
  const res = await POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({ id, type, data: { object } }),
    }),
  );
  expect(res.status).toBe(200);
  return id;
}

async function stored(org: string) {
  const [row] = await sql<
    {
      start: Date | null;
      end: Date | null;
      status: string;
      cancel: boolean;
    }[]
  >`
    SELECT current_period_start AS start, current_period_end AS end, status, cancel_at_period_end AS cancel
    FROM subscriptions WHERE organization_id = ${org}
  `;
  return row;
}

/** Splice's row as diag-0139 found it: 24 Sep as both ends. */
async function spliceWindow() {
  await sql`
    UPDATE subscriptions
    SET current_period_start = ${SEP_24}, current_period_end = ${SEP_24},
        status = 'active', cancel_at_period_end = false
    WHERE organization_id = ${ORG}
  `;
}

function warnings(warn: { mock: { calls: unknown[][] } }) {
  return warn.mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.includes("stripe_subscription_period_not_stored"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  for (const org of [ORG, CHECKOUT_ORG]) {
    await sql`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${org}, ${`period-${org}`}, 'Period Agency', ${`period-${org}`})
    `;
  }
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
      tier, billing_interval, status, current_period_start, current_period_end)
    VALUES (${ORG}, ${`cus_period_${RUN}`}, ${SUB}, ${PRICE}, 'agency_pro', 'monthly', 'active', ${SEP_24}, ${SEP_24})
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER}, ${`period-${OWNER}`}, ${ORG}, ${`owner-${RUN}@period.example.com.au`}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG}, ${OWNER}, 'owner', now(), now(), true)
  `;
}, 60_000);

beforeEach(async () => {
  await spliceWindow();
  retrieveMock.mockReset();
  updateMock.mockReset();
  currentUserMock.mockReset().mockResolvedValue({
    id: OWNER,
    organizationId: ORG,
    email: `owner-${RUN}@period.example.com.au`,
    name: "Owner",
    role: "owner",
    organization: { id: ORG, name: "Period Agency" },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await sql`DELETE FROM processed_webhook_events WHERE stripe_event_id = ANY(${eventIds})`;
  await sql`DELETE FROM org_members WHERE organization_id = ANY(${[ORG, CHECKOUT_ORG]})`;
  await sql`DELETE FROM users WHERE id = ${OWNER}`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ANY(${[ORG, CHECKOUT_ORG]})`;
  await sql`DELETE FROM organizations WHERE id = ANY(${[ORG, CHECKOUT_ORG]})`;
  await sql.end();
});

describe("customer.subscription.updated", () => {
  it("the 24 Oct renewal, in the pinned API version's shape, stores 24 Oct to 24 Nov", async () => {
    await deliver(
      "customer.subscription.updated",
      pinnedShape(SUB, { start: OCT_24, end: NOV_24 }),
    );
    expect(await stored(ORG)).toMatchObject({ start: OCT_24, end: NOV_24, status: "active" });
  });

  it("from an endpoint on an older API version too: the period on the subscription", async () => {
    await deliver("customer.subscription.updated", olderShape(SUB, { start: OCT_24, end: NOV_24 }));
    expect(await stored(ORG)).toMatchObject({ start: OCT_24, end: NOV_24 });
  });

  it("an event without a period keeps the stored one, records the rest, and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const id = await deliver(
      "customer.subscription.updated",
      pinnedShape(SUB, {}, { cancel_at_period_end: true }),
    );
    expect(await stored(ORG)).toEqual({
      start: SEP_24,
      end: SEP_24,
      status: "active",
      cancel: true,
    });
    expect(warnings(warn)).toEqual([
      {
        event: "stripe_subscription_period_not_stored",
        reason: "missing",
        items: 1,
        stripeEventId: id,
        type: "customer.subscription.updated",
      },
    ]);
  });

  it("an end not after its start is refused: the stored period stays", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await deliver(
      "customer.subscription.updated",
      pinnedShape(SUB, { start: NOV_24, end: OCT_24 }),
    );
    await deliver(
      "customer.subscription.updated",
      pinnedShape(SUB, { start: OCT_24, end: OCT_24 }),
    );
    expect(await stored(ORG)).toMatchObject({ start: SEP_24, end: SEP_24 });
    expect(warnings(warn).map((line) => line.reason)).toEqual([
      "end_not_after_start",
      "end_not_after_start",
    ]);
  });

  it("an event already processed is a duplicate: re-sending the 24 Oct event changes nothing", async () => {
    // The 24 Oct event, as the code before 3 Nov handled it: recorded, its period not stored.
    const oct24 = nextEventId();
    await sql`
      INSERT INTO processed_webhook_events (stripe_event_id, type)
      VALUES (${oct24}, 'customer.subscription.updated')
    `;
    await deliver(
      "customer.subscription.updated",
      pinnedShape(SUB, { start: OCT_24, end: NOV_24 }),
      oct24,
    );
    expect(await stored(ORG)).toMatchObject({ start: SEP_24, end: SEP_24 });

    // A new event about the same subscription (what editing its metadata in Stripe sends) is stored.
    await deliver(
      "customer.subscription.updated",
      pinnedShape(
        SUB,
        { start: OCT_24, end: NOV_24 },
        { metadata: { period_resync: "2026-11-08" } },
      ),
    );
    expect(await stored(ORG)).toMatchObject({ start: OCT_24, end: NOV_24 });
  });
});

describe("checkout.session.completed", () => {
  const session = () => ({
    id: `cs_period_${RUN}`,
    object: "checkout.session",
    mode: "subscription",
    customer: `cus_checkout_${RUN}`,
    subscription: CHECKOUT_SUB,
    metadata: { organizationId: CHECKOUT_ORG },
  });

  afterEach(async () => {
    await sql`DELETE FROM subscriptions WHERE organization_id = ${CHECKOUT_ORG}`;
  });

  it("stores the period of the subscription as Stripe's API returns it", async () => {
    retrieveMock.mockResolvedValue(pinnedShape(CHECKOUT_SUB, { start: OCT_24, end: NOV_24 }));
    await deliver("checkout.session.completed", session());
    expect(retrieveMock).toHaveBeenCalledWith(CHECKOUT_SUB);
    expect(await stored(CHECKOUT_ORG)).toMatchObject({ start: OCT_24, end: NOV_24 });
  });

  it("no usable period: the new row has none -- not the checkout's time, not the start", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    retrieveMock.mockResolvedValue(pinnedShape(CHECKOUT_SUB, { start: OCT_24 }));
    await deliver("checkout.session.completed", session());
    expect(await stored(CHECKOUT_ORG)).toMatchObject({ start: null, end: null, status: "active" });
    expect(warnings(warn).map((line) => line.reason)).toEqual(["missing"]);
  });
});

describe("the downgrade route", () => {
  async function downgrade() {
    const { POST } = await import("@/app/api/billing/downgrade/route");
    return (await POST()).status;
  }

  it("stores the cancellation with the period Stripe answers", async () => {
    updateMock.mockResolvedValue(
      pinnedShape(SUB, { start: OCT_24, end: NOV_24 }, { cancel_at_period_end: true }),
    );
    expect(await downgrade()).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(SUB, { cancel_at_period_end: true });
    expect(await stored(ORG)).toMatchObject({ start: OCT_24, end: NOV_24, cancel: true });
  });

  it("an answer without a usable period keeps the stored one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    updateMock.mockResolvedValue(
      pinnedShape(SUB, { start: OCT_24, end: OCT_24 }, { cancel_at_period_end: true }),
    );
    expect(await downgrade()).toBe(200);
    expect(await stored(ORG)).toMatchObject({ start: SEP_24, end: SEP_24, cancel: true });
    expect(warnings(warn)).toEqual([
      {
        event: "stripe_subscription_period_not_stored",
        reason: "end_not_after_start",
        items: 1,
        route: "billing/downgrade",
      },
    ]);
  });
});
