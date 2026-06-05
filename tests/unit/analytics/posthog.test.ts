import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-node", () => ({
  PostHog: class MockPostHog {
    capture = vi.fn();
    shutdown = vi.fn();
  },
}));

describe("getPostHogServer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://app.posthog.com");
  });

  it("returns a PostHog client instance", async () => {
    const { getPostHogServer } = await import("@/lib/analytics/posthog");
    const client = getPostHogServer();
    expect(client).toBeDefined();
    expect(client).toHaveProperty("capture");
  });

  it("returns the same instance on subsequent calls (singleton)", async () => {
    const { getPostHogServer } = await import("@/lib/analytics/posthog");
    const first = getPostHogServer();
    const second = getPostHogServer();
    expect(first).toBe(second);
  });
});
