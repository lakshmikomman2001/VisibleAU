import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn(),
  },
  setRlsContext: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  brands: {
    organizationId: "organization_id",
    deletedAt: "deleted_at",
  },
}));

vi.mock("@/lib/brands", () => ({
  checkBrandLimit: vi.fn(),
  inheritRegion: vi.fn(),
}));

import { GET } from "@/app/api/brands/route";
import { db } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";

const mockGetCurrentUser = vi.mocked(getCurrentUser);

function makeCurrentUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-uuid",
    clerkUserId: "clerk_user_1",
    organizationId: "org-uuid",
    email: "test@example.com",
    name: "Test User",
    role: "member",
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: {
      id: "org-uuid",
      clerkOrgId: "clerk_org_1",
      name: "Test Org",
      region: "au" as const,
      tier: "free" as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionCancelledAt: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    },
    ...overrides,
  };
}

function setupSelectChain(result: unknown[]) {
  const mockWhere = vi.fn().mockResolvedValue(result);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });
  return { mockFrom, mockWhere };
}

describe("GET /api/brands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns only non-deleted brands for the current org", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);

    const brandA = {
      id: "brand-1",
      organizationId: "org-uuid",
      name: "Brand A",
      domain: "branda.com.au",
      vertical: "tradies",
      region: "au",
      competitors: [],
      primaryRegions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    const brandB = {
      id: "brand-2",
      organizationId: "org-uuid",
      name: "Brand B",
      domain: "brandb.com.au",
      vertical: "saas",
      region: "au",
      competitors: [],
      primaryRegions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    setupSelectChain([brandA, brandB]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.brands).toHaveLength(2);
    expect(body.brands[0].name).toBe("Brand A");
    expect(body.brands[1].name).toBe("Brand B");
  });

  it("returns empty array when org has no brands", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);

    setupSelectChain([]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.brands).toEqual([]);
    expect(body.brands).toHaveLength(0);
  });

  it("calls setRlsContext with the user org id", async () => {
    const { setRlsContext } = await import("@/db/client");
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    setupSelectChain([]);

    await GET();

    expect(setRlsContext).toHaveBeenCalledWith(db, "org-uuid");
  });

  it("does not call db.select when user is not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    await GET();

    expect(db.select).not.toHaveBeenCalled();
  });
});
