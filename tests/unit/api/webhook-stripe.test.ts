import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stripe/client", () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

import { POST } from "@/app/api/webhooks/stripe/route";
import { stripe } from "@/lib/stripe/client";

const mockConstructEvent = vi.mocked(stripe.webhooks.constructEvent);

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    });

    const response = await POST(req);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("Missing stripe-signature header");
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

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
    mockConstructEvent.mockReturnValue({ type: "test.event" } as never);

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
    mockConstructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });

    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=123,v1=abc" },
      body: "",
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
  });
});
