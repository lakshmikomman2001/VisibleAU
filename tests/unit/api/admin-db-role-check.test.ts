import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  client: "app-connection-stub",
  serviceClient: "service-connection-stub",
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
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

import { GET } from "@/app/api/admin/db-role-check/route";
import { getCurrentUser } from "@/lib/auth/current-user";

const mockGetCurrentUser = vi.mocked(getCurrentUser);

function makeUser(email: string, role: "owner" | "admin" | "analyst" | "viewer" = "owner") {
  return {
    id: "u1",
    clerkUserId: "ba-1",
    organizationId: "org-1",
    email,
    name: "T",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: {
      id: "org-1",
      clerkOrgId: "ba-org-1",
      name: "Org",
      region: "au" as const,
    },
  } as unknown as Awaited<ReturnType<typeof getCurrentUser>>;
}

describe("GET /api/admin/db-role-check -- platform-admin only, 404 for everyone else", () => {
  const ORIGINAL_ALLOWLIST = process.env.PLATFORM_ADMIN_EMAILS;

  beforeEach(() => {
    mockGetCurrentUser.mockReset();
  });

  afterEach(() => {
    process.env.PLATFORM_ADMIN_EMAILS = ORIGINAL_ALLOWLIST;
  });

  it("404s when PLATFORM_ADMIN_EMAILS is unset (fails closed)", async () => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    mockGetCurrentUser.mockResolvedValue(makeUser("sri@vunnara.com.au"));

    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("404s for an authenticated user not on the allowlist, regardless of their own org role", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "sri@vunnara.com.au";
    // A real customer, owner of their own org -- not a platform admin.
    mockGetCurrentUser.mockResolvedValue(makeUser("customer@example.com", "owner"));

    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("404s for no session at all", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "sri@vunnara.com.au";
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("200s with both connections' role-check results for an allowlisted email", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "sri@vunnara.com.au, other@vunnara.com.au";
    mockGetCurrentUser.mockResolvedValue(makeUser("Sri@Vunnara.com.au")); // case-insensitive match

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.app).toMatchObject({ role: "stub", super: false, bypassrls: false });
    expect(body.service).toMatchObject({ role: "stub", super: false, bypassrls: false });
  });
});
