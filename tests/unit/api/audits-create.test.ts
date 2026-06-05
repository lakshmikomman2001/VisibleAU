import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
  setRlsContext: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  audits: { id: "id", organizationId: "organization_id", auditNumber: "audit_number" },
  brands: { id: "id", organizationId: "organization_id", deletedAt: "deleted_at" },
}));

vi.mock("@/lib/audit/numbering", () => ({
  getNextAuditNumber: vi.fn().mockResolvedValue(1),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

import { POST } from "@/app/api/audits/route";
import { getCurrentUser } from "@/lib/auth/current-user";

const mockGetCurrentUser = vi.mocked(getCurrentUser);

function makeCurrentUser() {
  return {
    id: "user-uuid",
    clerkUserId: "ba-user-1",
    organizationId: "org-uuid",
    email: "test@test.com",
    name: "Test",
    role: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: {
      id: "org-uuid",
      clerkOrgId: "ba-org-1",
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

describe("POST /api/audits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const req = new Request("http://localhost/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid brandId", async () => {
    mockGetCurrentUser.mockResolvedValue(makeCurrentUser() as never);
    const req = new Request("http://localhost/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: "not-a-uuid" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON", async () => {
    mockGetCurrentUser.mockResolvedValue(makeCurrentUser() as never);
    const req = new Request("http://localhost/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
