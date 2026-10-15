import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/sentry.server.config", () => ({}));
vi.mock("@/sentry.edge.config", () => ({}));
vi.mock("@/lib/db/role-check", () => ({
  logDbRoleCheck: vi.fn(async () => undefined),
}));
vi.mock("@/db/client", () => ({
  client: "app-connection-stub",
  serviceClient: "service-connection-stub",
}));

const mockGetRateLimiterBackend = vi.fn();
vi.mock("@/lib/sample-audit/rate-limit", () => ({
  getRateLimiterBackend: mockGetRateLimiterBackend,
  RATE_LIMITER_ENV_NAMES: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
}));

// Task #46 (17th follow-up), Part B: register() reads these at call time
// via dynamic import -- force a fresh module instance per test so the
// NODE_ENV/NEXT_RUNTIME branches in instrumentation.ts actually see this
// test's own env stub, not whatever was cached from a previous import.
async function loadRegister() {
  vi.resetModules();
  const mod = await import("@/instrumentation");
  return mod.register;
}

describe("instrumentation.ts register() -- rate_limiter_disabled startup log", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetRateLimiterBackend.mockReset();
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("logs rate_limiter_disabled at error level in production when Redis is unconfigured", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    mockGetRateLimiterBackend.mockReturnValue("disabled");

    const register = await loadRegister();
    await register();
    // The check is fire-and-forget (.then()), not awaited inside register() --
    // flush the microtask queue before asserting.
    await new Promise((r) => setTimeout(r, 0));

    const call = errorSpy.mock.calls.find((c: unknown[]) => {
      try {
        return JSON.parse(c[0] as string).event === "rate_limiter_disabled";
      } catch {
        return false;
      }
    });
    expect(call).toBeDefined();
    const logged = JSON.parse(call![0] as string);
    expect(logged).toEqual({
      event: "rate_limiter_disabled",
      reason: "missing_env",
      namesChecked: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    });
  });

  it("does not log when Redis IS configured in production", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    mockGetRateLimiterBackend.mockReturnValue("upstash");

    const register = await loadRegister();
    await register();
    await new Promise((r) => setTimeout(r, 0));

    const call = errorSpy.mock.calls.find((c: unknown[]) => {
      try {
        return JSON.parse(c[0] as string).event === "rate_limiter_disabled";
      } catch {
        return false;
      }
    });
    expect(call).toBeUndefined();
  });

  it("does not log outside production, even when Redis is unconfigured", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "development");
    mockGetRateLimiterBackend.mockReturnValue("disabled");

    const register = await loadRegister();
    await register();
    await new Promise((r) => setTimeout(r, 0));

    expect(mockGetRateLimiterBackend).not.toHaveBeenCalled();
    const call = errorSpy.mock.calls.find((c: unknown[]) => {
      try {
        return JSON.parse(c[0] as string).event === "rate_limiter_disabled";
      } catch {
        return false;
      }
    });
    expect(call).toBeUndefined();
  });

  it("never logs an env var VALUE, only the names checked", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    mockGetRateLimiterBackend.mockReturnValue("disabled");

    const register = await loadRegister();
    await register();
    await new Promise((r) => setTimeout(r, 0));

    const allLoggedText = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join(" ");
    expect(allLoggedText).not.toContain("http://");
    expect(allLoggedText).not.toContain("https://");
  });
});
