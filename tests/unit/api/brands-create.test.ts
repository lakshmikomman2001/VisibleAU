import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
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

import { POST } from "@/app/api/brands/route";
import { db } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { checkBrandLimit, inheritRegion } from "@/lib/brands";

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockCheckBrandLimit = vi.mocked(checkBrandLimit);
const mockInheritRegion = vi.mocked(inheritRegion);

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

function setupSelectCountChain(countValue: number) {
  const mockWhere = vi.fn().mockResolvedValue([{ count: countValue }]);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });
  return { mockFrom, mockWhere };
}

function setupInsertChain(result: unknown) {
  const mockReturning = vi.fn().mockResolvedValue([result]);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });
  return { mockValues, mockReturning };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/brands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/brands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await POST(
      makeRequest({ name: "Test", domain: "test.com", vertical: "tradies" }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when name is missing", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);

    const response = await POST(makeRequest({ domain: "test.com", vertical: "tradies" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("returns 400 when domain is missing", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);

    const response = await POST(makeRequest({ name: "Test Brand", vertical: "tradies" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("returns 400 when vertical is invalid", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);

    const response = await POST(
      makeRequest({ name: "Test Brand", domain: "test.com", vertical: "invalid_vertical" }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("returns 400 when primaryRegions has invalid format", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);

    const response = await POST(
      makeRequest({
        name: "Test Brand",
        domain: "test.com",
        vertical: "tradies",
        primaryRegions: ["bad-format"],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("returns 403 when brand limit reached for tier", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    setupSelectCountChain(1); // already at limit for free tier
    mockCheckBrandLimit.mockReturnValue(false);

    const response = await POST(
      makeRequest({ name: "Test Brand", domain: "test.com", vertical: "tradies" }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("Brand limit reached");
  });

  it("returns 201 with brand on success", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    setupSelectCountChain(0);
    mockCheckBrandLimit.mockReturnValue(true);
    mockInheritRegion.mockReturnValue("au");

    const createdBrand = {
      id: "brand-uuid",
      organizationId: "org-uuid",
      name: "Test Brand",
      domain: "test.com",
      vertical: "tradies",
      region: "au",
      competitors: [],
      primaryRegions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    setupInsertChain(createdBrand);

    const response = await POST(
      makeRequest({ name: "Test Brand", domain: "test.com", vertical: "tradies" }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.brand).toBeDefined();
    expect(body.brand.name).toBe("Test Brand");
    expect(body.brand.domain).toBe("test.com");
  });

  it("cleans domain: strips protocol", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    setupSelectCountChain(0);
    mockCheckBrandLimit.mockReturnValue(true);
    mockInheritRegion.mockReturnValue("au");

    const mockReturning = vi.fn().mockResolvedValue([{ id: "b1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await POST(
      makeRequest({ name: "Test", domain: "https://example.com.au", vertical: "tradies" }),
    );

    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues.domain).toBe("example.com.au");
  });

  it("cleans domain: strips trailing slash", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    setupSelectCountChain(0);
    mockCheckBrandLimit.mockReturnValue(true);
    mockInheritRegion.mockReturnValue("au");

    const mockReturning = vi.fn().mockResolvedValue([{ id: "b1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await POST(makeRequest({ name: "Test", domain: "example.com.au/", vertical: "tradies" }));

    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues.domain).toBe("example.com.au");
  });

  it("cleans domain: lowercases", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    setupSelectCountChain(0);
    mockCheckBrandLimit.mockReturnValue(true);
    mockInheritRegion.mockReturnValue("au");

    const mockReturning = vi.fn().mockResolvedValue([{ id: "b1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await POST(makeRequest({ name: "Test", domain: "Example.COM.AU", vertical: "tradies" }));

    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues.domain).toBe("example.com.au");
  });

  it("cleans domain: strips protocol + trailing slash + lowercases combined", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    setupSelectCountChain(0);
    mockCheckBrandLimit.mockReturnValue(true);
    mockInheritRegion.mockReturnValue("au");

    const mockReturning = vi.fn().mockResolvedValue([{ id: "b1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await POST(
      makeRequest({ name: "Test", domain: "HTTPS://MyBrand.COM.AU///", vertical: "tradies" }),
    );

    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues.domain).toBe("mybrand.com.au");
  });

  it("region is inherited from organization, not from request body", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    setupSelectCountChain(0);
    mockCheckBrandLimit.mockReturnValue(true);
    mockInheritRegion.mockReturnValue("au");

    const mockReturning = vi.fn().mockResolvedValue([{ id: "b1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await POST(makeRequest({ name: "Test", domain: "test.com", vertical: "tradies" }));

    // inheritRegion should be called with the organization
    expect(mockInheritRegion).toHaveBeenCalledWith(user.organization);
    // The inserted values should use the result from inheritRegion
    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues.region).toBe("au");
  });

  it("passes organization to checkBrandLimit", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    setupSelectCountChain(0);
    mockCheckBrandLimit.mockReturnValue(true);
    mockInheritRegion.mockReturnValue("au");
    setupInsertChain({ id: "b1" });

    await POST(makeRequest({ name: "Test", domain: "test.com", vertical: "tradies" }));

    expect(mockCheckBrandLimit).toHaveBeenCalledWith(user.organization, 0);
  });

  it("accepts valid primaryRegions format", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    setupSelectCountChain(0);
    mockCheckBrandLimit.mockReturnValue(true);
    mockInheritRegion.mockReturnValue("au");
    setupInsertChain({ id: "b1", primaryRegions: ["NSW:Bondi", "VIC:Fitzroy"] });

    const response = await POST(
      makeRequest({
        name: "Test",
        domain: "test.com",
        vertical: "tradies",
        primaryRegions: ["NSW:Bondi", "VIC:Fitzroy"],
      }),
    );

    expect(response.status).toBe(201);
  });
});
