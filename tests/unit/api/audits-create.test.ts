import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  };
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
  audits: { id: "id", organizationId: "organization_id", auditNumber: "audit_number" },
  brands: { id: "id", organizationId: "organization_id", deletedAt: "deleted_at" },
  // lib/audit/organic-filter.ts's ORGANIC_ONLY reads citations.isBrandedPrompt
  // at module-evaluation time (not lazily) -- this route now imports
  // runAuditInline, which imports it transitively, so this mock needs at
  // least this one column reference to exist, even though this test never
  // exercises any citations-querying code itself.
  citations: { isBrandedPrompt: "is_branded_prompt" },
}));

// Build 1 addendum, item 9: brandReadyForAudit reads lib/prompts/
// templates.ts's real CATEGORY_KEYS -- not mocked, so these tests use
// an actual category key from that list ("trades_plumbing").
const READY_BRAND = {
  id: "brand-uuid",
  organizationId: "org-uuid",
  classificationStatus: "complete",
  classification: {
    category: "trades_plumbing",
    buyerType: "smb",
    confidence: 0.95,
    intentSignals: [],
    competitors: [],
    auRelevance: "au_present",
  },
  categoryConfirmedAt: new Date(),
  locationMode: "fixed",
  promptPackVersion: 1,
};

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

  // Build 1 addendum, item 9: never silently fall back to a generic or
  // stale-classification pack -- block, with a clear reason.
  describe("needs-confirmation gate", () => {
    it("returns 400 'needs_confirmation' for a brand with no location confirmed", async () => {
      mockGetCurrentUser.mockResolvedValue(makeCurrentUser() as never);
      const { db } = await import("@/db/client");
      vi.mocked(db.select).mockReturnValue({
        from: () => ({ where: () => Promise.resolve([{ ...READY_BRAND, locationMode: null }]) }),
      } as never);

      const req = new Request("http://localhost/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("needs_confirmation");
    });

    it("returns 400 'needs_confirmation' for an Omega-shaped brand (complete, category not a real key, confidence < 0.7, never confirmed) even with a location set", async () => {
      mockGetCurrentUser.mockResolvedValue(makeCurrentUser() as never);
      const { db } = await import("@/db/client");
      vi.mocked(db.select).mockReturnValue({
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                ...READY_BRAND,
                classification: {
                  category: "trades_general_services",
                  buyerType: "smb",
                  confidence: 0.62,
                  intentSignals: [],
                  competitors: [],
                  auRelevance: "au_present",
                },
                categoryConfirmedAt: null,
              },
            ]),
        }),
      } as never);

      const req = new Request("http://localhost/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("needs_confirmation");
    });
  });
});
