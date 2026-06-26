import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn() },
    checkout: { sessions: { retrieve: vi.fn() } },
    subscriptions: { retrieve: vi.fn() },
  },
}));

const mockVerify = vi.fn();
vi.mock("@/lib/stripe/verify-webhook", () => ({
  verifyStripeWebhook: (...args: unknown[]) => mockVerify(...args),
}));

const mockTransaction = vi.fn();
vi.mock("@/db/client", () => ({
  db: {
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { POST } from "@/app/api/webhooks/stripe/route";

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (fn: Function) => {
      const fakeTx = {
        query: {
          processedWebhookEvents: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      return fn(fakeTx);
    });
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    mockVerify.mockRejectedValue(new Error("Missing stripe-signature header"));

    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    });

    const response = await POST(req);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid signature");
  });

  it("returns 400 when signature verification fails", async () => {
    mockVerify.mockRejectedValue(new Error("Invalid signature"));

    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=123,v1=abc" },
      body: "{}",
    });

    const response = await POST(req);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid signature");
  });

  it("returns 200 with received:true on valid signature", async () => {
    mockVerify.mockResolvedValue({ id: "evt_test", type: "test.event" });

    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=123,v1=valid" },
      body: JSON.stringify({ type: "test.event" }),
    });

    const response = await POST(req);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.received).toBe(true);
  });

  it("returns 400 for empty body with signature", async () => {
    mockVerify.mockRejectedValue(
      new Error("No signatures found matching the expected signature"),
    );

    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=123,v1=abc" },
      body: "",
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
  });
});
