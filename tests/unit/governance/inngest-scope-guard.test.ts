import { afterEach, describe, expect, it, vi } from "vitest";
import { loadScopedOrAbort } from "@/lib/governance/inngest-scope-guard";

describe("loadScopedOrAbort()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the row when no event org/brand is supplied at all", async () => {
    const row = await loadScopedOrAbort({
      fn: "test-fn",
      entityId: "entity-1",
      load: async () => ({ organizationId: "org-a", brandId: "brand-a" }),
    });
    expect(row).toEqual({ organizationId: "org-a", brandId: "brand-a" });
  });

  it("returns the row when the event org/brand agree with the row", async () => {
    const row = await loadScopedOrAbort({
      fn: "test-fn",
      entityId: "entity-1",
      load: async () => ({ organizationId: "org-a", brandId: "brand-a" }),
      eventOrganizationId: "org-a",
      eventBrandId: "brand-a",
    });
    expect(row).toEqual({ organizationId: "org-a", brandId: "brand-a" });
  });

  it("returns null when the loader finds nothing (no log emitted)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const row = await loadScopedOrAbort({
      fn: "test-fn",
      entityId: "entity-missing",
      load: async () => undefined,
      eventOrganizationId: "org-a",
    });
    expect(row).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("aborts and logs inngest_scope_mismatch when the event org disagrees with the row", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const row = await loadScopedOrAbort({
      fn: "detect-drift",
      entityId: "audit-1",
      load: async () => ({ organizationId: "org-real", brandId: "brand-a" }),
      eventOrganizationId: "org-attacker",
    });
    expect(row).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged).toEqual({
      event: "inngest_scope_mismatch",
      fn: "detect-drift",
      entityId: "audit-1",
    });
  });

  it("aborts and logs when the event brandId disagrees with the row's brandId", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const row = await loadScopedOrAbort({
      fn: "test-fn",
      entityId: "audit-1",
      load: async () => ({ organizationId: "org-a", brandId: "brand-real" }),
      eventOrganizationId: "org-a",
      eventBrandId: "brand-attacker",
    });
    expect(row).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("never logs an email, token, or secret -- only fn and entityId", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await loadScopedOrAbort({
      fn: "test-fn",
      entityId: "audit-1",
      load: async () => ({ organizationId: "org-real", brandId: null }),
      eventOrganizationId: "org-attacker",
    });
    const logged = errorSpy.mock.calls[0][0] as string;
    expect(logged).not.toContain("org-real");
    expect(logged).not.toContain("org-attacker");
  });

  it("does not flag a brand mismatch when the row's own brandId is null (org-level entity)", async () => {
    const row = await loadScopedOrAbort({
      fn: "test-fn",
      entityId: "entity-1",
      load: async () => ({ organizationId: "org-a", brandId: null }),
      eventOrganizationId: "org-a",
      eventBrandId: "brand-whatever",
    });
    expect(row).toEqual({ organizationId: "org-a", brandId: null });
  });
});
