import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  db: { select: vi.fn() },
  setRlsContext: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  audits: { id: "id", organizationId: "organization_id" },
  citations: { auditId: "audit_id" },
}));

import { GET } from "@/app/api/audits/[auditId]/route";
import { getCurrentUser } from "@/lib/auth/current-user";

const mockGetCurrentUser = vi.mocked(getCurrentUser);

function makeUser() {
  return {
    id: "u1",
    clerkUserId: "ba-1",
    organizationId: "org-1",
    email: "t@t.com",
    name: "T",
    role: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
    organization: {
      id: "org-1",
      clerkOrgId: "ba-org-1",
      name: "Org",
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

describe("GET /api/audits/[auditId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost/api/audits/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"),
      { params: Promise.resolve({ auditId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for invalid UUID", async () => {
    mockGetCurrentUser.mockResolvedValue(makeUser() as never);
    const res = await GET(new Request("http://localhost/api/audits/bad"), {
      params: Promise.resolve({ auditId: "bad" }),
    });
    expect(res.status).toBe(404);
  });
});
