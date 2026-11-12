/**
 * Google AI follow-ups (12 Nov), part 4 -- Test connection on /admin/settings. "Provider credentials: On ·
 * set" only meant the env vars existed (production, 12 Nov: they were set and DataForSEO refused them).
 * POST /api/admin/settings/test-connection asks DataForSEO's free account endpoint, operators only, once
 * per 30 seconds, and never echoes the credentials or a header.
 *
 * DataForSEO is answered by its real responses (tests/helpers/dataforseo-recorded.ts): the 11 Nov
 * user_data (balance US$0.97), the 12 Nov 401 / 40100, or a network error. No call leaves the machine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordedDataForSeoFetch } from "@/tests/helpers/dataforseo-recorded";

const { admin, claim } = vi.hoisted(() => ({
  admin: { allowed: false, userId: "better-auth-user" as string | null },
  claim: vi.fn(),
}));
vi.mock("@/lib/auth/platform-admin", () => ({
  checkPlatformAdmin: vi.fn(async () => ({ ...admin })),
}));
vi.mock("@/lib/governance/pg-rate-limit", () => ({ claimOncePerWindow: claim }));

import { POST } from "@/app/api/admin/settings/test-connection/route";

const SECRETS = ["test-login", "test-password", "Basic ", "Authorization", "dGVzdC1sb2dpbj"];

beforeEach(() => {
  admin.allowed = true;
  claim.mockReset();
  claim.mockResolvedValue(true);
  vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
  vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function test(provider: ReturnType<typeof recordedDataForSeoFetch>) {
  vi.stubGlobal("fetch", provider.fetchImpl);
  const res = await POST();
  const text = await res.text();
  for (const s of SECRETS) expect(text).not.toContain(s);
  return { status: res.status, body: JSON.parse(text) as Record<string, unknown> };
}

describe("POST /api/admin/settings/test-connection", () => {
  it("accepted: the balance, the time, and a warning under US$5", async () => {
    const provider = recordedDataForSeoFetch();
    const { status, body } = await test(provider);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      state: "accepted",
      line: "Accepted · balance US$0.97",
      balanceUsd: 0.97,
      lowBalance: true,
      statusCode: 20000,
    });
    expect(Date.parse(String(body.checkedAt))).not.toBeNaN();
    expect(provider.calls.map((c) => c.url)).toEqual([
      "https://api.dataforseo.com/v3/appendix/user_data",
    ]);
    expect(claim).toHaveBeenCalledWith("admin-google-test-connection", 30_000);
  });

  it("rejected: 'the login or password is wrong'", async () => {
    const { status, body } = await test(recordedDataForSeoFetch({ rejected: true }));
    expect(status).toBe(200);
    expect(body).toMatchObject({
      state: "rejected",
      line: "Rejected: the login or password is wrong (DataForSEO 40100)",
      lowBalance: false,
      statusCode: 40100,
    });
  });

  it("a network error: not tested, saying why", async () => {
    const { status, body } = await test(recordedDataForSeoFetch({ unreachable: true }));
    expect(status).toBe(200);
    expect(body).toMatchObject({
      state: "error",
      line: "Not tested: The provider couldn't be reached (TypeError).",
      statusCode: null,
    });
  });

  it("refused for a non-operator: 403, and nothing is asked", async () => {
    admin.allowed = false;
    const provider = recordedDataForSeoFetch();
    const { status, body } = await test(provider);
    expect(status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
    expect(provider.calls).toEqual([]);
    expect(claim).not.toHaveBeenCalled();
  });

  it("once per 30 seconds: a second test is a 429, and nothing is asked", async () => {
    claim.mockResolvedValue(false);
    const provider = recordedDataForSeoFetch();
    const { status, body } = await test(provider);
    expect(status).toBe(429);
    expect(body).toEqual({ error: "Wait 30 seconds between connection tests." });
    expect(provider.calls).toEqual([]);
  });

  it("credentials not set: says so, and nothing is asked", async () => {
    vi.stubEnv("DATAFORSEO_PASSWORD", "");
    const provider = recordedDataForSeoFetch();
    const { body } = await test(provider);
    expect(body).toMatchObject({
      state: "not_set",
      line: "Not tested: DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD aren't set.",
    });
    expect(provider.calls).toEqual([]);
  });
});
