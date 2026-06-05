import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  setRlsContext: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  brands: { id: "id", organizationId: "organization_id", deletedAt: "deleted_at" },
}));

vi.mock("@/lib/brands", () => ({
  TIER_BRAND_LIMITS: {
    free: 1,
    starter: 1,
    growth: 1,
    agency: 5,
    agency_pro: 25,
    enterprise: Infinity,
  },
  checkBrandLimit: vi.fn().mockReturnValue(true),
  inheritRegion: vi.fn().mockReturnValue("au"),
  getBrandForOrg: vi.fn(),
}));

import { PATCH } from "@/app/api/brands/[brandId]/route";
import { POST } from "@/app/api/brands/route";
import { db } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockGetBrandForOrg = vi.mocked(getBrandForOrg);

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

const validBrandId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("POST /api/brands — edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetCurrentUser.mockResolvedValue(makeCurrentUser() as never);

    const req = new Request("http://localhost/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid json",
    });

    const response = await POST(req);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 400 for empty body", async () => {
    mockGetCurrentUser.mockResolvedValue(makeCurrentUser() as never);

    const req = new Request("http://localhost/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("cleanDomain handles www. prefix (keeps it — not stripped per spec)", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);

    const mockCountWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const mockCountFrom = vi.fn().mockReturnValue({ where: mockCountWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockCountFrom });

    const mockReturning = vi.fn().mockResolvedValue([{ id: "b1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    await POST(
      new Request("http://localhost/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test",
          domain: "www.example.com.au",
          vertical: "tradies",
        }),
      }),
    );

    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues.domain).toBe("www.example.com.au");
  });

  it("validates primaryRegions format: rejects numbers in suburb", async () => {
    mockGetCurrentUser.mockResolvedValue(makeCurrentUser() as never);

    const req = new Request("http://localhost/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        domain: "test.com",
        vertical: "tradies",
        primaryRegions: ["NSW:2000"],
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("validates primaryRegions format: accepts 3-char state code", async () => {
    mockGetCurrentUser.mockResolvedValue(makeCurrentUser() as never);

    const mockCountWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const mockCountFrom = vi.fn().mockReturnValue({ where: mockCountWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockCountFrom });

    const mockReturning = vi.fn().mockResolvedValue([{ id: "b1" }]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: mockValues });

    const req = new Request("http://localhost/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        domain: "test.com",
        vertical: "tradies",
        primaryRegions: ["NSW:Bondi", "ACT:Canberra"],
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(201);
  });
});

describe("PATCH /api/brands/[brandId] — edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for malformed JSON body", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue({ id: validBrandId } as never);

    const req = new Request(`http://localhost/api/brands/${validBrandId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const response = await PATCH(req, { params: Promise.resolve({ brandId: validBrandId }) });
    expect(response.status).toBe(400);
  });

  it("succeeds with empty object {} (no fields to update)", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue({ id: validBrandId } as never);

    const mockReturning = vi.fn().mockResolvedValue([{ id: validBrandId, name: "Same" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const req = new Request(`http://localhost/api/brands/${validBrandId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await PATCH(req, { params: Promise.resolve({ brandId: validBrandId }) });
    expect(response.status).toBe(200);
  });

  it("strips unknown fields from PATCH body (Zod ignores them)", async () => {
    const user = makeCurrentUser();
    mockGetCurrentUser.mockResolvedValue(user as never);
    mockGetBrandForOrg.mockResolvedValue({ id: validBrandId } as never);

    const mockReturning = vi.fn().mockResolvedValue([{ id: validBrandId }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({ set: mockSet });

    const req = new Request(`http://localhost/api/brands/${validBrandId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated", admin: true, secretField: "hack" }),
    });

    const response = await PATCH(req, { params: Promise.resolve({ brandId: validBrandId }) });
    expect(response.status).toBe(200);

    const setArg = mockSet.mock.calls[0][0];
    expect(setArg).not.toHaveProperty("admin");
    expect(setArg).not.toHaveProperty("secretField");
    expect(setArg.name).toBe("Updated");
  });
});
