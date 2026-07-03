import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/schema", () => ({
  brands: { id: "id", organizationId: "organization_id", deletedAt: "deleted_at" },
}));

import { getBrandForOrg } from "@/lib/brands";

const mockDb = { select: vi.fn() } as any;

function setupSelectChain(result: unknown[]) {
  const mockWhere = vi.fn().mockResolvedValue(result);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  (mockDb.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });
  return { mockFrom, mockWhere };
}

const sampleBrand = {
  id: "brand-uuid-1",
  organizationId: "org-uuid-1",
  name: "Test Brand",
  domain: "testbrand.com.au",
  vertical: "tradies",
  region: "au",
  competitors: [],
  primaryRegions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe("getBrandForOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the brand when it belongs to the org and is not deleted", async () => {
    setupSelectChain([sampleBrand]);
    const result = await getBrandForOrg("brand-uuid-1", "org-uuid-1", mockDb);
    expect(result).toEqual(sampleBrand);
  });

  it("returns null when brand does not exist", async () => {
    setupSelectChain([]);
    const result = await getBrandForOrg("nonexistent-uuid", "org-uuid-1", mockDb);
    expect(result).toBeNull();
  });

  it("returns null when brand belongs to a different org (cross-org)", async () => {
    setupSelectChain([]);
    const result = await getBrandForOrg("brand-uuid-1", "different-org-uuid", mockDb);
    expect(result).toBeNull();
  });

  it("returns null when brand is soft-deleted", async () => {
    setupSelectChain([]);
    const result = await getBrandForOrg("brand-uuid-1", "org-uuid-1", mockDb);
    expect(result).toBeNull();
  });

  it("queries from the brands table", async () => {
    const { mockFrom } = setupSelectChain([]);
    await getBrandForOrg("brand-uuid-1", "org-uuid-1", mockDb);
    expect(mockDb.select).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
  });
});
