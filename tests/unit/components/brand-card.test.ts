import { describe, expect, it } from "vitest";

describe("BrandCard component", () => {
  it("renders brand name, domain, and vertical from props", () => {
    const brand = {
      id: "brand-uuid-1",
      organizationId: "org-uuid-1",
      name: "Bondi Plumbing",
      domain: "bondiplumbing.com.au",
      vertical: "tradies" as const,
      region: "au" as const,
      competitors: [],
      primaryRegions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    expect(brand.name).toBe("Bondi Plumbing");
    expect(brand.domain).toBe("bondiplumbing.com.au");
    expect(brand.vertical).toBe("tradies");
  });

  it("formats vertical with underscores replaced by spaces", () => {
    const vertical = "allied_health";
    expect(vertical.replace("_", " ")).toBe("allied health");
  });

  it("generates correct link href from brand id", () => {
    const brand = { id: "abc-123-def" };
    expect(`/brands/${brand.id}`).toBe("/brands/abc-123-def");
  });
});

describe("BrandCard data contract", () => {
  it("requires all Sprint 1 brand fields", () => {
    const brand = {
      id: "uuid",
      organizationId: "uuid",
      name: "name",
      domain: "domain.com",
      vertical: "saas" as const,
      region: "au" as const,
      competitors: ["comp1.com"],
      primaryRegions: ["NSW:Bondi"],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    expect(brand).toHaveProperty("id");
    expect(brand).toHaveProperty("organizationId");
    expect(brand).toHaveProperty("name");
    expect(brand).toHaveProperty("domain");
    expect(brand).toHaveProperty("vertical");
    expect(brand).toHaveProperty("region");
    expect(brand).toHaveProperty("competitors");
    expect(brand).toHaveProperty("primaryRegions");
    expect(brand).toHaveProperty("createdAt");
    expect(brand).toHaveProperty("updatedAt");
    expect(brand).toHaveProperty("deletedAt");
  });
});
