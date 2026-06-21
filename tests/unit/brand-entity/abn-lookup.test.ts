import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupAbn } from "@/lib/brand-entity/abn-lookup";

describe("lookupAbn — bypass modes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("skip mode returns abnVerified=false with check_skipped status and no fetch", async () => {
    vi.stubEnv("ABN_LOOKUP_BYPASS", "skip");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await lookupAbn("58110395714");

    expect(result.abnVerified).toBe(false);
    expect(result.abnStatus).toBe("check_skipped");
    expect(result.abnNumber).toBe("58110395714");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("skip mode with null abn still returns check_skipped", async () => {
    vi.stubEnv("ABN_LOOKUP_BYPASS", "skip");

    const result = await lookupAbn(null);

    expect(result.abnVerified).toBe(false);
    expect(result.abnStatus).toBe("check_skipped");
    expect(result.abnNumber).toBeNull();
  });

  it("mock-verified refuses in real LLM mode and falls back to skip", async () => {
    vi.stubEnv("ABN_LOOKUP_BYPASS", "mock-verified");
    vi.stubEnv("LLM_MODE", "real");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await lookupAbn("58110395714");

    expect(result.abnVerified).toBe(false);
    expect(result.abnStatus).toBe("check_skipped");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("REFUSED mock-verified bypass"),
    );
    consoleSpy.mockRestore();
  });

  it("unset bypass with no GUID returns empty (real path attempted)", async () => {
    vi.stubEnv("ABN_LOOKUP_BYPASS", "");
    vi.stubEnv("ABN_LOOKUP_GUID", "");

    const result = await lookupAbn("58110395714");

    expect(result.abnVerified).toBe(false);
    expect(result.abnStatus).toBeNull();
  });
});
