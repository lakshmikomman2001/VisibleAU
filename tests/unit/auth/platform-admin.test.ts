import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/db/client", () => ({
  serviceDb: {
    select: vi.fn(),
  },
}));

vi.mock("@/db/schema/auth", () => ({
  authUsers: { id: "id", email: "email", emailVerified: "email_verified" },
}));

import { serviceDb } from "@/db/client";
import { checkPlatformAdmin, isPlatformAdmin } from "@/lib/auth/platform-admin";

function setupAuthUserRow(row: { email: string; emailVerified: boolean } | undefined) {
  const mockWhere = vi.fn().mockResolvedValue(row ? [row] : []);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  (serviceDb.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });
}

const ORIGINAL_ALLOWLIST = process.env.PLATFORM_ADMIN_EMAILS;

describe("checkPlatformAdmin() / isPlatformAdmin()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PLATFORM_ADMIN_EMAILS = ORIGINAL_ALLOWLIST;
  });

  it("no session → not allowed, userId null", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await checkPlatformAdmin();
    expect(result).toEqual({ allowed: false, userId: null });
  });

  it("unset PLATFORM_ADMIN_EMAILS → not allowed, even for the right user (fails closed)", async () => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    const result = await checkPlatformAdmin();
    expect(result).toEqual({ allowed: false, userId: "u1" });
    // Must fail closed before ever querying the DB for an allowlist that doesn't exist.
    expect(serviceDb.select).not.toHaveBeenCalled();
  });

  it("verified email on the allowlist → allowed", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "sri@vunnara.com.au";
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    setupAuthUserRow({ email: "sri@vunnara.com.au", emailVerified: true });

    const result = await checkPlatformAdmin();
    expect(result).toEqual({ allowed: true, userId: "u1" });
  });

  it("verified email, different case and surrounding whitespace on both sides → still allowed", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "  Sri@Vunnara.com.au  ,other@vunnara.com.au";
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    setupAuthUserRow({ email: "  SRI@VUNNARA.COM.AU  ", emailVerified: true });

    const result = await checkPlatformAdmin();
    expect(result).toEqual({ allowed: true, userId: "u1" });
  });

  it("UNVERIFIED email on the allowlist → not allowed (the hardening this follow-up adds)", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "sri@vunnara.com.au";
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    setupAuthUserRow({ email: "sri@vunnara.com.au", emailVerified: false });

    const result = await checkPlatformAdmin();
    expect(result).toEqual({ allowed: false, userId: "u1" });
  });

  it("verified email NOT on the allowlist → not allowed", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "sri@vunnara.com.au";
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    setupAuthUserRow({ email: "someone-else@vunnara.com.au", emailVerified: true });

    const result = await checkPlatformAdmin();
    expect(result).toEqual({ allowed: false, userId: "u1" });
  });

  it("session user id has no matching auth_users row → not allowed", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "sri@vunnara.com.au";
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    setupAuthUserRow(undefined);

    const result = await checkPlatformAdmin();
    expect(result).toEqual({ allowed: false, userId: "u1" });
  });

  it("no wildcard/domain matching -- a subdomain or partial match never passes", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "@vunnara.com.au";
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    setupAuthUserRow({ email: "anyone@vunnara.com.au", emailVerified: true });

    const result = await checkPlatformAdmin();
    expect(result.allowed).toBe(false);
  });

  it("isPlatformAdmin() returns just the boolean", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "sri@vunnara.com.au";
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    setupAuthUserRow({ email: "sri@vunnara.com.au", emailVerified: true });

    expect(await isPlatformAdmin()).toBe(true);
  });
});
