import { beforeEach, describe, expect, it, vi } from "vitest";

// Vunnara Build 1, Part C.4/E.2: this route had no test coverage at
// all before this change -- same mock shape as tests/unit/api/brands-
// patch-location.test.ts (its own @/lib/governance mock, since the
// sibling brands-single.test.ts/brands-edge-cases.test.ts's shared
// @/db/client mock is missing serviceDb, a pre-existing gap unrelated
// to this task).
vi.mock("@/db/client", () => {
  const mockDb = { update: vi.fn() };
  return {
    db: mockDb,
    withRlsContext: vi.fn(async (_orgId: string, fn: Function) => fn(mockDb)),
    setRlsContext: vi.fn(),
  };
});

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  brands: {
    id: "id",
    organizationId: "organization_id",
    deletedAt: "deleted_at",
  },
}));

vi.mock("@/lib/brands", () => ({
  getBrandForOrg: vi.fn(),
}));

vi.mock("@/lib/prompts/regenerate-prompt-pack", () => ({
  regeneratePromptPack: vi.fn(),
}));

const { mockAssertBrandAccess, MockBrandAccessDeniedError } = vi.hoisted(() => {
  class MockBrandAccessDeniedError extends Error {
    constructor() {
      super("Brand access denied");
      this.name = "BrandAccessDeniedError";
    }
  }
  return { mockAssertBrandAccess: vi.fn(), MockBrandAccessDeniedError };
});

vi.mock("@/lib/governance", () => ({
  assertBrandAccess: mockAssertBrandAccess,
  BrandAccessDeniedError: MockBrandAccessDeniedError,
}));

import { PATCH } from "@/app/api/brands/[brandId]/confirm-classification/route";
import { db } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { regeneratePromptPack } from "@/lib/prompts/regenerate-prompt-pack";

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockGetBrandForOrg = vi.mocked(getBrandForOrg);
const mockRegeneratePromptPack = vi.mocked(regeneratePromptPack);

const validBrandId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function makeCurrentUser() {
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
  };
}

function makeBrand(overrides: Record<string, unknown> = {}) {
  return {
    id: validBrandId,
    organizationId: "org-uuid",
    name: "Test Brand",
    domain: "testbrand.com.au",
    vertical: "tradies" as const,
    region: "au" as const,
    competitors: ["Existing Co"],
    primaryRegions: [],
    ...overrides,
  };
}

function makeParams(brandId: string) {
  return { params: Promise.resolve({ brandId }) };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/brands/some-id/confirm-classification", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupUpdateChain(result: unknown) {
  const mockReturning = vi.fn().mockResolvedValue([result]);
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });
  return { mockSet, mockWhere, mockReturning };
}

describe("PATCH /api/brands/[brandId]/confirm-classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertBrandAccess.mockResolvedValue(undefined);
  });

  it("merges confirmed competitors into the existing list, never replacing it", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(makeBrand() as never);
    const { mockSet } = setupUpdateChain(makeBrand());

    await PATCH(
      makeRequest({
        categories: ["trades_plumbing"],
        audience: "households",
        confirmedCompetitors: ["New Rival Co"],
      }),
      makeParams(validBrandId),
    );

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.competitors).toEqual(["Existing Co", "New Rival Co"]);
    expect(setArg.categories).toEqual(["trades_plumbing"]);
    expect(setArg.audience).toBe("households");
    expect(setArg.classificationStatus).toBe("complete");
  });

  it("regenerates the prompt pack after confirming", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(makeBrand() as never);
    setupUpdateChain(makeBrand());

    await PATCH(
      makeRequest({ categories: ["trades_plumbing"], audience: "households" }),
      makeParams(validBrandId),
    );

    expect(mockRegeneratePromptPack).toHaveBeenCalledWith(expect.anything(), validBrandId);
  });

  it("returns 400 for an invalid category", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);

    const response = await PATCH(
      makeRequest({ categories: ["not_a_real_category"], audience: "households" }),
      makeParams(validBrandId),
    );

    expect(response.status).toBe(400);
    expect(mockRegeneratePromptPack).not.toHaveBeenCalled();
  });

  it("returns 403 when assertBrandAccess denies access", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockAssertBrandAccess.mockRejectedValue(new MockBrandAccessDeniedError());

    const response = await PATCH(
      makeRequest({ categories: ["trades_plumbing"], audience: "households" }),
      makeParams(validBrandId),
    );

    expect(response.status).toBe(403);
  });
});
