import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => {
  function makeWhereResult() {
    const arr = [{ id: "brand-1", name: "Test Brand", domain: "test.com" }];
    (arr as any).orderBy = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue([]),
    });
    (arr as any).limit = vi.fn().mockResolvedValue(arr);
    return arr;
  }
  const mockTx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(makeWhereResult()),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "t-1", status: "in_progress" }]),
        }),
      }),
    }),
  };
  return {
    db: mockTx,
    serviceDb: mockTx,
    withRlsContext: vi.fn(async (_orgId: string, fn: Function) => fn(mockTx)),
    setRlsContext: vi.fn(),
  };
});

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  brands: { id: "id", name: "name", organizationId: "organization_id", deletedAt: "deleted_at" },
  brandEntityScores: { brandId: "brand_id", checkedAt: "checked_at" },
  subscriptions: { tier: "tier", organizationId: "organization_id" },
  orgMembers: { organizationId: "organization_id", userId: "user_id", isActive: "is_active", role: "role", brandAccess: "brand_access" },
  remediationTasks: { id: "id", brandId: "brand_id" },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/lib/platform/explainability", () => ({
  ExplainabilityService: { annotate: vi.fn(() => ({})) },
}));

vi.mock("@/lib/workflow/task-manager", () => ({
  updateTaskStatus: vi.fn(() => ({ id: "t-1", status: "in_progress" })),
}));

const mockAssertTier = vi.fn();
const mockAssertBrandAccess = vi.fn();

class MockTierInsufficientError extends Error {
  public readonly requiredTier: string;
  constructor(requiredTier: string) {
    super(`${requiredTier} plan required`);
    this.name = "TierInsufficientError";
    this.requiredTier = requiredTier;
  }
}

class MockBrandAccessDeniedError extends Error {
  constructor() {
    super("Brand access denied");
    this.name = "BrandAccessDeniedError";
  }
}

vi.mock("@/lib/governance", () => ({
  assertBrandAccess: mockAssertBrandAccess,
  assertTier: mockAssertTier,
  BrandAccessDeniedError: MockBrandAccessDeniedError,
  TierInsufficientError: MockTierInsufficientError,
  recordAction: vi.fn(),
  canPerformAction: vi.fn(() => true),
  canAssignRole: vi.fn(() => true),
  canActOnMember: vi.fn(() => true),
  getMemberRecord: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth/current-user";

const mockGetCurrentUser = vi.mocked(getCurrentUser);

const FREE_USER = {
  id: "user-1",
  clerkUserId: "clerk_1",
  organizationId: "org-1",
  email: "free@test.com",
  name: "Free User",
  role: "owner",
  createdAt: new Date(),
  updatedAt: new Date(),
  organization: {
    id: "org-1",
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
};

const BRAND_ID = "418f321f-2489-4560-aaa9-895728580465";
const TASK_ID = "a18f321f-2489-4560-aaa9-895728580465";

describe("D-2 break-proof: entity-score GET is tier-gated", () => {
  beforeEach(() => vi.clearAllMocks());

  it("free-tier user gets 403 from entity-score GET", async () => {
    mockGetCurrentUser.mockResolvedValue(FREE_USER as never);
    mockAssertTier.mockRejectedValue(new MockTierInsufficientError("growth"));

    const { GET } = await import("@/app/api/brands/[brandId]/entity-score/route");

    const response = await GET(
      new Request("http://localhost/api/brands/" + BRAND_ID + "/entity-score"),
      { params: Promise.resolve({ brandId: BRAND_ID }) },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("growth");
  });

  it("BREAK-PROOF: without assertTier, route would return 200/null (gate is load-bearing)", async () => {
    mockGetCurrentUser.mockResolvedValue(FREE_USER as never);
    mockAssertTier.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/brands/[brandId]/entity-score/route");

    const response = await GET(
      new Request("http://localhost/api/brands/" + BRAND_ID + "/entity-score"),
      { params: Promise.resolve({ brandId: BRAND_ID }) },
    );

    expect([200, 404]).toContain(response.status);
  });
});

describe("D-3 break-proof: tasks/[id] PATCH write-path is tier-gated", () => {
  beforeEach(() => vi.clearAllMocks());

  it("free-tier user gets 403 from tasks/[id] PATCH", async () => {
    mockGetCurrentUser.mockResolvedValue(FREE_USER as never);
    mockAssertTier.mockRejectedValue(new MockTierInsufficientError("growth"));

    const { PATCH } = await import("@/app/api/brands/[brandId]/tasks/[id]/route");

    const response = await PATCH(
      new Request("http://localhost/api/brands/" + BRAND_ID + "/tasks/" + TASK_ID, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      }),
      { params: Promise.resolve({ brandId: BRAND_ID, id: TASK_ID }) },
    );

    expect(mockAssertTier).toHaveBeenCalled();
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("growth");
  });

  it("BREAK-PROOF: without assertTier, PATCH would succeed (gate is load-bearing)", async () => {
    mockGetCurrentUser.mockResolvedValue(FREE_USER as never);
    mockAssertTier.mockResolvedValue(undefined);

    const { PATCH } = await import("@/app/api/brands/[brandId]/tasks/[id]/route");

    const response = await PATCH(
      new Request("http://localhost/api/brands/" + BRAND_ID + "/tasks/" + TASK_ID, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      }),
      { params: Promise.resolve({ brandId: BRAND_ID, id: TASK_ID }) },
    );

    expect(response.status).not.toBe(403);
  });
});
