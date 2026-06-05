import { beforeEach, describe, expect, it, vi } from "vitest";
import { isFreeTierEnabled } from "@/lib/feature-flags";

describe("isFreeTierEnabled", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns true when FREE_TIER_ENABLED_AU=true", () => {
    vi.stubEnv("FREE_TIER_ENABLED_AU", "true");
    expect(isFreeTierEnabled("au")).toBe(true);
  });

  it("returns false when FREE_TIER_ENABLED_UK=false", () => {
    vi.stubEnv("FREE_TIER_ENABLED_UK", "false");
    expect(isFreeTierEnabled("uk")).toBe(false);
  });

  it("returns false when env var is not set", () => {
    expect(isFreeTierEnabled("ca")).toBe(false);
  });

  it("returns true for nz when set", () => {
    vi.stubEnv("FREE_TIER_ENABLED_NZ", "true");
    expect(isFreeTierEnabled("nz")).toBe(true);
  });

  it("is case-insensitive on region input (uppercases internally)", () => {
    vi.stubEnv("FREE_TIER_ENABLED_EU", "true");
    expect(isFreeTierEnabled("eu")).toBe(true);
  });
});
