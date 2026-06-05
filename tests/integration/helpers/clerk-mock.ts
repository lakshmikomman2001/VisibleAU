import { vi } from "vitest";

export function mockClerkAuth(
  overrides: Partial<{ userId: string; orgId: string; orgRole: string }> = {},
) {
  vi.mock("@/lib/auth/server", () => ({
    auth: {
      api: {
        getSession: vi.fn().mockResolvedValue({
          user: { id: overrides.userId ?? "test-user-id", email: "test@test.com", name: "Test" },
          session: { activeOrganizationId: overrides.orgId ?? "test-org-id" },
        }),
      },
    },
  }));
  vi.mock("@/lib/auth/current-user", () => ({
    getCurrentUser: vi.fn().mockResolvedValue({
      id: "test-user-uuid",
      clerkUserId: overrides.userId ?? "test-user-id",
      organizationId: "test-org-uuid",
      email: "test@test.com",
      name: "Test User",
      role: "owner",
      createdAt: new Date(),
      updatedAt: new Date(),
      organization: {
        id: "test-org-uuid",
        clerkOrgId: overrides.orgId ?? "test-org-id",
        name: "Test Agency",
        tier: "starter",
        region: "au",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionCancelledAt: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    }),
  }));
}

export function mockClerkAuthDifferentOrg() {
  return mockClerkAuth({ orgId: "different-org-id" });
}
