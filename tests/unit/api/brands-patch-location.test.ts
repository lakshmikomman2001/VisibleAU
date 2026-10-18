import { beforeEach, describe, expect, it, vi } from "vitest";

// Vunnara Build 1, Part D.4: a focused test file for the PATCH route's
// new location fields, with its OWN complete mock set (including
// @/lib/governance) rather than extending tests/unit/api/brands-
// single.test.ts, whose existing PATCH/DELETE tests were already
// failing before this task touched anything ("No serviceDb export is
// defined on the @/db/client mock" -- assertBrandAccess calls
// serviceDb directly and that file's mock never added it). Fixing that
// pre-existing gap is unrelated to Part D, so this file mocks
// @/lib/governance directly instead (the same pattern already used in
// tests/unit/governance/d2d3-tier-gate-breakproof.test.ts) to get real
// coverage of the new code without touching the broken file.
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

import { PATCH } from "@/app/api/brands/[brandId]/route";
import { db } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockGetBrandForOrg = vi.mocked(getBrandForOrg);

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
    competitors: [],
    primaryRegions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeParams(brandId: string) {
  return { params: Promise.resolve({ brandId }) };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/brands/some-id", {
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

describe("PATCH /api/brands/[brandId] -- Part D.4 location confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertBrandAccess.mockResolvedValue(undefined);
  });

  it("sets locationConfirmedAt when confirming a fixed location", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(makeBrand() as never);
    const { mockSet } = setupUpdateChain(makeBrand({ locationMode: "fixed" }));

    const response = await PATCH(
      makeRequest({
        locationMode: "fixed",
        suburb: "Bondi",
        city: "Sydney",
        state: "NSW",
        country: "Australia",
        primaryRegions: ["NSW:Bondi"],
      }),
      makeParams(validBrandId),
    );

    expect(response.status).toBe(200);
    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.locationMode).toBe("fixed");
    expect(setArg.suburb).toBe("Bondi");
    expect(setArg.state).toBe("NSW");
    expect(setArg.locationConfirmedAt).toBeInstanceOf(Date);
  });

  it("sets locationConfirmedAt when confirming online-only, with no suburb", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(makeBrand() as never);
    const { mockSet } = setupUpdateChain(makeBrand({ locationMode: "online_only" }));

    const response = await PATCH(
      makeRequest({ locationMode: "online_only", primaryRegions: [] }),
      makeParams(validBrandId),
    );

    expect(response.status).toBe(200);
    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.locationMode).toBe("online_only");
    expect(setArg.locationConfirmedAt).toBeInstanceOf(Date);
  });

  it("does not touch locationConfirmedAt for an unrelated field update", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(makeBrand() as never);
    const { mockSet } = setupUpdateChain(makeBrand());

    await PATCH(makeRequest({ name: "Renamed Brand" }), makeParams(validBrandId));

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg.name).toBe("Renamed Brand");
    expect(setArg.locationConfirmedAt).toBeUndefined();
  });

  it("returns 400 for an invalid state code", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(makeBrand() as never);

    const response = await PATCH(
      makeRequest({ locationMode: "fixed", suburb: "Bondi", city: "Sydney", state: "ZZ" }),
      makeParams(validBrandId),
    );

    expect(response.status).toBe(400);
  });
});
