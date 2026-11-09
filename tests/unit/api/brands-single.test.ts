import { beforeEach, describe, expect, it, vi } from "vitest";

// 9 Nov: stale since the route gained a brand check before its own read (assertBrandAccess, 401daa3), a role
// check (27388a0), the schedules a delete pauses (f13411d) and the prompt-pack and schedule follow-ups after
// a PATCH. Those are mocked here; the database schema is the real one. The real routes, against the test
// database, are tests/integration/brand-not-found.integration.test.ts.
const { mockAssertBrandAccess } = vi.hoisted(() => ({ mockAssertBrandAccess: vi.fn() }));

vi.mock("@/db/client", () => {
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
  };
  return {
    db: mockDb,
    serviceDb: mockDb,
    withRlsContext: vi.fn(async (_orgId: string, fn: Function) => fn(mockDb)),
    setRlsContext: vi.fn(),
  };
});

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/governance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/governance")>()),
  assertBrandAccess: mockAssertBrandAccess,
  // The role check, allowed (tests/integration/role-enforcement covers it).
  roleRefusal: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/brands", () => ({
  getBrandForOrg: vi.fn(),
}));

vi.mock("@/lib/brands/needs-confirmation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/brands/needs-confirmation")>()),
  reactivateScheduleIfReady: vi.fn(async () => undefined),
}));

vi.mock("@/lib/prompts/regenerate-prompt-pack", () => ({
  regeneratePromptPack: vi.fn(async () => undefined),
}));

import { DELETE, GET, PATCH } from "@/app/api/brands/[brandId]/route";
import { db } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { BrandAccessDeniedError } from "@/lib/governance";

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockGetBrandForOrg = vi.mocked(getBrandForOrg);

/** What the real assertBrandAccess throws for another workspace's brand, or one that doesn't exist. */
const notThisWorkspaces = () => new BrandAccessDeniedError("not_found");

beforeEach(() => {
  mockAssertBrandAccess.mockReset();
  mockAssertBrandAccess.mockResolvedValue(undefined);
});

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

function makeBrand(overrides: Record<string, unknown> = {}) {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
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

const validBrandId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const crossOrgBrandId = "11111111-2222-4333-8444-555555555555";

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

function setupSoftDeleteChain() {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });
  return { mockSet, mockWhere };
}

// --------------------------------------------------------------------------
// GET /api/brands/[brandId]
// --------------------------------------------------------------------------

describe("GET /api/brands/[brandId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(
      new Request(`http://localhost/api/brands/${validBrandId}`),
      makeParams(validBrandId),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 for invalid UUID", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);

    const response = await GET(
      new Request("http://localhost/api/brands/not-a-uuid"),
      makeParams("not-a-uuid"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("returns 404 for cross-org brand (not 401)", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    // The brand check finds it in another workspace (getBrandForOrg would also return null: it filters by orgId)
    mockAssertBrandAccess.mockRejectedValueOnce(notThisWorkspaces());
    mockGetBrandForOrg.mockResolvedValue(null);

    const response = await GET(
      new Request(`http://localhost/api/brands/${crossOrgBrandId}`),
      makeParams(crossOrgBrandId),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("returns 404 for soft-deleted brand", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    // The brand check and getBrandForOrg both leave out deletedAt != null
    mockAssertBrandAccess.mockRejectedValueOnce(notThisWorkspaces());
    mockGetBrandForOrg.mockResolvedValue(null);

    const response = await GET(
      new Request(`http://localhost/api/brands/${validBrandId}`),
      makeParams(validBrandId),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("returns 200 with brand for own org", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);

    const brand = makeBrand();
    mockGetBrandForOrg.mockResolvedValue(brand as never);

    const response = await GET(
      new Request(`http://localhost/api/brands/${validBrandId}`),
      makeParams(validBrandId),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.brand).toBeDefined();
    expect(body.brand.name).toBe("Test Brand");
    expect(body.brand.domain).toBe("testbrand.com.au");
  });

  it("returns 403 for a same-workspace brand the member's role doesn't extend to", async () => {
    mockGetCurrentUser.mockResolvedValue(makeCurrentUser() as never);
    mockAssertBrandAccess.mockRejectedValueOnce(new BrandAccessDeniedError("role_restricted"));

    const response = await GET(
      new Request(`http://localhost/api/brands/${validBrandId}`),
      makeParams(validBrandId),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Brand access denied");
  });

  it("calls getBrandForOrg with correct brandId and orgId", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(null);

    await GET(new Request(`http://localhost/api/brands/${validBrandId}`), makeParams(validBrandId));

    expect(mockGetBrandForOrg).toHaveBeenCalledWith(validBrandId, "org-uuid", expect.anything());
  });
});

// --------------------------------------------------------------------------
// PATCH /api/brands/[brandId]
// --------------------------------------------------------------------------

describe("PATCH /api/brands/[brandId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await PATCH(makeRequest({ name: "Updated" }), makeParams(validBrandId));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 for invalid UUID", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);

    const response = await PATCH(makeRequest({ name: "Updated" }), makeParams("not-a-uuid"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("returns 404 for cross-org brand (not 401)", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockAssertBrandAccess.mockRejectedValueOnce(notThisWorkspaces());
    mockGetBrandForOrg.mockResolvedValue(null);

    const response = await PATCH(makeRequest({ name: "Updated" }), makeParams(crossOrgBrandId));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("returns 400 for invalid body", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(makeBrand() as never);

    const response = await PATCH(
      makeRequest({ vertical: "not_a_valid_vertical" }),
      makeParams(validBrandId),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("returns 200 with updated brand", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(makeBrand() as never);

    const updatedBrand = makeBrand({ name: "Updated Brand" });
    setupUpdateChain(updatedBrand);

    const response = await PATCH(makeRequest({ name: "Updated Brand" }), makeParams(validBrandId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.brand).toBeDefined();
    expect(body.brand.name).toBe("Updated Brand");
  });

  it("cannot change region via PATCH (region is pinned at create)", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(makeBrand() as never);

    // The updateBrandSchema does not include region, so it gets stripped
    const updatedBrand = makeBrand({ name: "Updated", region: "au" });
    const { mockSet } = setupUpdateChain(updatedBrand);

    const response = await PATCH(
      makeRequest({ name: "Updated", region: "uk" }),
      makeParams(validBrandId),
    );

    expect(response.status).toBe(200);
    // The set call should not include 'region' because the schema strips it
    const setArg = mockSet.mock.calls[0][0];
    expect(setArg).not.toHaveProperty("region");
    expect(setArg).toHaveProperty("name", "Updated");
  });

  it("updates updatedAt timestamp on PATCH", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(makeBrand() as never);

    const updatedBrand = makeBrand({ name: "Updated" });
    const { mockSet } = setupUpdateChain(updatedBrand);

    await PATCH(makeRequest({ name: "Updated" }), makeParams(validBrandId));

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg).toHaveProperty("updatedAt");
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });
});

// --------------------------------------------------------------------------
// DELETE /api/brands/[brandId]
// --------------------------------------------------------------------------

describe("DELETE /api/brands/[brandId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await DELETE(
      new Request(`http://localhost/api/brands/${validBrandId}`, { method: "DELETE" }),
      makeParams(validBrandId),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 for invalid UUID", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);

    const response = await DELETE(
      new Request("http://localhost/api/brands/not-a-uuid", { method: "DELETE" }),
      makeParams("not-a-uuid"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("returns 404 for cross-org brand (not 204!)", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockAssertBrandAccess.mockRejectedValueOnce(notThisWorkspaces());
    mockGetBrandForOrg.mockResolvedValue(null);

    const response = await DELETE(
      new Request(`http://localhost/api/brands/${crossOrgBrandId}`, { method: "DELETE" }),
      makeParams(crossOrgBrandId),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("returns 204 on success", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(makeBrand() as never);
    setupSoftDeleteChain();

    const response = await DELETE(
      new Request(`http://localhost/api/brands/${validBrandId}`, { method: "DELETE" }),
      makeParams(validBrandId),
    );

    expect(response.status).toBe(204);
  });

  it("sets deletedAt on soft delete (not hard delete)", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(makeBrand() as never);
    const { mockSet } = setupSoftDeleteChain();

    await DELETE(
      new Request(`http://localhost/api/brands/${validBrandId}`, { method: "DELETE" }),
      makeParams(validBrandId),
    );

    expect(db.update).toHaveBeenCalled();
    const setArg = mockSet.mock.calls[0][0];
    expect(setArg).toHaveProperty("deletedAt");
    expect(setArg.deletedAt).toBeInstanceOf(Date);
    expect(setArg).toHaveProperty("updatedAt");
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it("returns empty body for 204 response", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue(makeBrand() as never);
    setupSoftDeleteChain();

    const response = await DELETE(
      new Request(`http://localhost/api/brands/${validBrandId}`, { method: "DELETE" }),
      makeParams(validBrandId),
    );

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });
});
