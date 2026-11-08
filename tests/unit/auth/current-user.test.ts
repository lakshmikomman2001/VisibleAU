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

vi.mock("@/db/schema", () => ({
  users: { id: "users.id", clerkUserId: "clerk_user_id", organizationId: "organization_id" },
  organizations: { id: "id" },
  orgMembers: {
    organizationId: "org_members.organization_id",
    userId: "org_members.user_id",
    isActive: "org_members.is_active",
    acceptedAt: "org_members.accepted_at",
  },
}));

import { serviceDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";

function setupDbChain(result: unknown[]) {
  const mockWhere = vi.fn().mockResolvedValue(result);
  // users, joined to its workspace and (follow-ups from 6e27afc..01a6a8c, part 1) to its membership there.
  const chain: { innerJoin: ReturnType<typeof vi.fn>; where: typeof mockWhere } = {
    innerJoin: vi.fn(),
    where: mockWhere,
  };
  chain.innerJoin.mockReturnValue(chain);
  const mockFrom = vi.fn().mockReturnValue(chain);
  (serviceDb.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });
  return { mockFrom, mockInnerJoin: chain.innerJoin, mockWhere };
}

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when not authenticated (no session)", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await getCurrentUser();
    expect(result).toBeNull();
  });

  it("returns null when session has no user id", async () => {
    mockGetSession.mockResolvedValue({ user: { id: null }, session: {} });
    const result = await getCurrentUser();
    expect(result).toBeNull();
  });

  it("returns null when DB rows do not exist yet (signup race)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "ba-user-123" }, session: {} });
    setupDbChain([]);
    const result = await getCurrentUser();
    expect(result).toBeNull();
  });

  it("returns user with organization when found", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "ba-user-123" }, session: {} });
    const mockUser = {
      id: "user-uuid",
      clerkUserId: "ba-user-123",
      organizationId: "org-uuid",
      email: "test@example.com",
      name: "Test User",
      role: "member",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mockOrg = {
      id: "org-uuid",
      clerkOrgId: "ba-org-1",
      name: "Test Org",
      region: "au",
      tier: "free",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionCancelledAt: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    setupDbChain([{ users: mockUser, organizations: mockOrg }]);

    const result = await getCurrentUser();
    expect(result).not.toBeNull();
    expect(result!.id).toBe("user-uuid");
    expect(result!.email).toBe("test@example.com");
    expect(result!.organization.id).toBe("org-uuid");
    expect(result!.organization.tier).toBe("free");
  });

  it("needs a membership in the profile's workspace: joins org_members as well as the workspace", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "ba-xyz" }, session: {} });
    const { mockInnerJoin } = setupDbChain([]);
    await getCurrentUser();
    expect(mockInnerJoin).toHaveBeenCalledTimes(2);
    expect(mockInnerJoin.mock.calls[1][0]).toMatchObject({ isActive: "org_members.is_active" });
  });

  it("queries by clerkUserId (Better Auth user ID)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "ba-xyz" }, session: {} });
    const { mockWhere } = setupDbChain([]);
    await getCurrentUser();
    expect(mockWhere).toHaveBeenCalled();
  });
});
