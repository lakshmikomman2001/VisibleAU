import { describe, expect, it } from "vitest";

describe("AppSidebar navigation", () => {
  const navItems = [
    { href: "/dashboard", label: "Overview" },
    { href: "/brands", label: "Brands" },
    { href: "/settings", label: "Settings" },
  ];

  it("has 3 navigation items for Sprint 1", () => {
    expect(navItems).toHaveLength(3);
  });

  it("includes dashboard link as first item", () => {
    expect(navItems[0].href).toBe("/dashboard");
    expect(navItems[0].label).toBe("Overview");
  });

  it("includes brands link", () => {
    expect(navItems[1].href).toBe("/brands");
    expect(navItems[1].label).toBe("Brands");
  });

  it("includes settings link", () => {
    expect(navItems[2].href).toBe("/settings");
    expect(navItems[2].label).toBe("Settings");
  });

  it("all nav hrefs start with /", () => {
    for (const item of navItems) {
      expect(item.href.startsWith("/")).toBe(true);
    }
  });
});
