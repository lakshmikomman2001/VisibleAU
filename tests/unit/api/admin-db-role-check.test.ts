import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  client: "app-connection-stub",
  serviceClient: "service-connection-stub",
}));

vi.mock("@/lib/auth/platform-admin", () => ({
  checkPlatformAdmin: vi.fn(),
}));

vi.mock("@/lib/db/role-check", () => ({
  checkDbRole: vi.fn(async () => ({
    role: "stub",
    super: false,
    bypassrls: false,
    neonSuperuser: null,
    rowSecurity: "on",
  })),
}));

vi.mock("@/lib/sample-audit/rate-limit", () => ({
  getRateLimiterBackend: vi.fn(() => "disabled"),
}));

import { GET } from "@/app/api/admin/db-role-check/route";
import { checkPlatformAdmin } from "@/lib/auth/platform-admin";
import { getRateLimiterBackend } from "@/lib/sample-audit/rate-limit";

const mockCheckPlatformAdmin = vi.mocked(checkPlatformAdmin);
const mockGetRateLimiterBackend = vi.mocked(getRateLimiterBackend);

describe("GET /api/admin/db-role-check -- platform-admin only, 404 for everyone else", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockCheckPlatformAdmin.mockReset();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("404s when not allowed, and logs admin_access with allowed=false, no email", async () => {
    mockCheckPlatformAdmin.mockResolvedValue({ allowed: false, userId: "u1" });

    const res = await GET();
    expect(res.status).toBe(404);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged).toEqual({
      event: "admin_access",
      userId: "u1",
      route: "/api/admin/db-role-check",
      allowed: false,
    });
  });

  it("404s for no session at all (userId null)", async () => {
    mockCheckPlatformAdmin.mockResolvedValue({ allowed: false, userId: null });

    const res = await GET();
    expect(res.status).toBe(404);
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.userId).toBeNull();
  });

  it("200s with both connections' role-check results when allowed, and logs admin_access with allowed=true, no email", async () => {
    mockCheckPlatformAdmin.mockResolvedValue({ allowed: true, userId: "u1" });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.app).toMatchObject({ role: "stub", super: false, bypassrls: false });
    expect(body.service).toMatchObject({ role: "stub", super: false, bypassrls: false });

    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged).toEqual({
      event: "admin_access",
      userId: "u1",
      route: "/api/admin/db-role-check",
      allowed: true,
    });
    // Never logs an email, under any key.
    expect(JSON.stringify(logged)).not.toMatch(/@/);
  });

  // Task #46 (17th follow-up), Part B.
  it("reports rateLimiter: 'disabled' when Redis is unconfigured", async () => {
    mockCheckPlatformAdmin.mockResolvedValue({ allowed: true, userId: "u1" });
    mockGetRateLimiterBackend.mockReturnValue("disabled");

    const res = await GET();
    const body = await res.json();
    expect(body.rateLimiter).toBe("disabled");
  });

  it("reports rateLimiter: 'upstash' when Redis is configured via UPSTASH_REDIS_REST_URL/_TOKEN", async () => {
    mockCheckPlatformAdmin.mockResolvedValue({ allowed: true, userId: "u1" });
    mockGetRateLimiterBackend.mockReturnValue("upstash");

    const res = await GET();
    const body = await res.json();
    expect(body.rateLimiter).toBe("upstash");
  });

  // Task #46 (18th follow-up): Vercel's Upstash Marketplace integration
  // creates KV_REST_API_URL/_TOKEN, not UPSTASH_REDIS_REST_URL/_TOKEN.
  it("reports rateLimiter: 'kv' when Redis is configured via the KV_REST_API_* fallback", async () => {
    mockCheckPlatformAdmin.mockResolvedValue({ allowed: true, userId: "u1" });
    mockGetRateLimiterBackend.mockReturnValue("kv");

    const res = await GET();
    const body = await res.json();
    expect(body.rateLimiter).toBe("kv");
  });

  // Email (Resend): the same check instrumentation.ts logs as email_disabled.
  it("reports email: 'disabled' without RESEND_API_KEY and 'resend' once both names are set", async () => {
    mockCheckPlatformAdmin.mockResolvedValue({ allowed: true, userId: "u1" });

    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "Vunnara <audits@vunnara.com.au>");
    expect((await (await GET()).json()).email).toBe("disabled");

    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    expect((await (await GET()).json()).email).toBe("resend");
    vi.unstubAllEnvs();
  });
});
