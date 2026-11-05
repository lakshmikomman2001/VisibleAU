import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/sentry.server.config", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));
// The startup check never builds a client: no need to load the real SDK inside a test.
vi.mock("resend", () => ({ Resend: class {} }));
vi.mock("@/sentry.edge.config", () => ({}));
vi.mock("@/lib/db/role-check", () => ({
  logDbRoleCheck: vi.fn(async () => undefined),
}));
vi.mock("@/db/client", () => ({
  client: "app-connection-stub",
  serviceClient: "service-connection-stub",
}));

const mockGetRateLimiterBackend = vi.fn();
// Task #46 (18th follow-up): the real RATE_LIMITER_ENV_NAMES now has 4
// entries (UPSTASH_* then the KV_REST_API_* Vercel-Marketplace fallback)
// -- mirrored here, not just asserted against, so this test would catch
// a drift between the mock and the real export.
const MOCKED_ENV_NAMES = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
];
vi.mock("@/lib/sample-audit/rate-limit", () => ({
  getRateLimiterBackend: mockGetRateLimiterBackend,
  RATE_LIMITER_ENV_NAMES: MOCKED_ENV_NAMES,
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
      namesChecked: MOCKED_ENV_NAMES,
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

// 27 Oct: production's RESEND_FROM_EMAIL held the Resend API key. Startup says so,
// by reason only, before any email is tried.
describe("instrumentation.ts register() -- the email config at startup", () => {
  const KEY_AS_FROM = "re_live_9f8e7d6c5b4a3210";
  let errorSpy: ReturnType<typeof vi.spyOn>;

  function emailEvents(): Record<string, unknown>[] {
    return errorSpy.mock.calls.flatMap((c: unknown[]) => {
      try {
        const line = JSON.parse(c[0] as string) as Record<string, unknown>;
        return String(line.event).startsWith("email_") ? [line] : [];
      } catch {
        return [];
      }
    });
  }

  async function start() {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    mockGetRateLimiterBackend.mockReturnValue("upstash");
    const register = await loadRegister();
    await register();
  }

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGetRateLimiterBackend.mockReset();
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("an API key as the from address: email_config_invalid, looks_like_secret, and never the value", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", KEY_AS_FROM);
    await start();
    await vi.waitFor(() =>
      expect(emailEvents()).toContainEqual(
        expect.objectContaining({
          event: "email_config_invalid",
          reason: "looks_like_secret",
          at: "startup",
        }),
      ),
    );
    expect(errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join(" ")).not.toContain(
      KEY_AS_FROM,
    );
  });

  it("a name that isn't set is still email_disabled, missing_env", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    await start();
    await vi.waitFor(() =>
      expect(emailEvents()).toContainEqual({
        event: "email_disabled",
        reason: "missing_env",
        missing: ["RESEND_FROM_EMAIL"],
      }),
    );
  });

  it("a good from address says nothing about email", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "Vunnara <audits@vunnara.com.au>");
    await start();
    await new Promise((r) => setTimeout(r, 50));
    expect(emailEvents()).toEqual([]);
  });
});
