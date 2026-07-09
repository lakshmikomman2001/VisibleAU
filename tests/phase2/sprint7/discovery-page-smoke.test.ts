import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  useParams: vi.fn(() => ({ brandId: "test-brand-id" })),
  usePathname: vi.fn(() => "/brands/test-brand-id/discovery"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "test-user",
    organizationId: "test-org",
    email: "test@test.com",
  })),
}));

vi.mock("@/db/client", () => ({
  withRlsContext: vi.fn(async (_orgId: string, fn: Function) => fn({})),
  serviceDb: {},
}));

const DISCOVERY_PAGES = [
  {
    path: "@/app/(auth)/brands/[brandId]/discovery/page",
    label: "Discovery hub",
  },
  {
    path: "@/app/(auth)/brands/[brandId]/discovery/journeys/page",
    label: "Journeys",
  },
  {
    path: "@/app/(auth)/brands/[brandId]/discovery/comparisons/page",
    label: "Comparisons",
  },
];

describe("Discovery page-module-export smoke (runtime import)", () => {
  for (const page of DISCOVERY_PAGES) {
    it(`${page.label} page exports a default function`, async () => {
      const mod = await import(page.path);
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe("function");
    });
  }
});
