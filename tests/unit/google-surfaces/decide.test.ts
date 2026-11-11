/**
 * Google AI surfaces, Phase 1, part 1 -- the resolution order (env kill switch -> credentials -> global
 * setting -> workspace override -> plan), as lib/governance/google-surfaces.ts's pure decideGoogleSurfaces,
 * and resolveGoogleSurfaces with the env switch off reading nothing at all.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const { queries } = vi.hoisted(() => ({ queries: { count: 0 } }));

// Any database read while the env switch is off fails the test.
vi.mock("@/db/client", () => ({
  serviceDb: new Proxy(
    {},
    {
      get() {
        queries.count++;
        throw new Error("no database read expected");
      },
    },
  ),
}));
vi.mock("@/lib/pricing/effective-tier", () => ({
  effectiveTier: vi.fn(async () => {
    queries.count++;
    throw new Error("no plan read expected");
  }),
}));

import {
  DEFAULT_GOOGLE_SURFACE_SETTINGS,
  decideGoogleSurfaces,
  type GoogleSurfaceInputs,
  parseGoogleSetting,
  resolveGoogleSurfaces,
} from "@/lib/governance/google-surfaces";

const base: GoogleSurfaceInputs = {
  envEnabled: true,
  credentialsPresent: true,
  isSample: false,
  settings: { ...DEFAULT_GOOGLE_SURFACE_SETTINGS, aiOverviewsEnabled: true, aiModeEnabled: true },
  overrides: { google_ai_overviews: null, google_ai_mode: null },
  tier: "growth",
};

afterEach(() => {
  vi.unstubAllEnvs();
  queries.count = 0;
});

describe("decideGoogleSurfaces: the resolution order", () => {
  it("everything on, Growth: both surfaces on, from the global setting", () => {
    const d = decideGoogleSurfaces(base);
    expect(d.google_ai_overviews).toEqual({ on: true, reason: "On in the global settings" });
    expect(d.google_ai_mode.on).toBe(true);
  });

  it("env off: off, whatever the database says (settings and overrides on)", () => {
    const d = decideGoogleSurfaces({
      ...base,
      envEnabled: false,
      overrides: { google_ai_overviews: true, google_ai_mode: true },
    });
    expect(d.google_ai_overviews.on).toBe(false);
    expect(d.google_ai_mode.on).toBe(false);
    expect(d.google_ai_mode.reason).toContain("GOOGLE_AI_SURFACES_ENABLED");
  });

  it("credentials missing: off", () => {
    const d = decideGoogleSurfaces({ ...base, credentialsPresent: false });
    expect(d.google_ai_overviews).toEqual({
      on: false,
      reason: "Off: the provider's credentials aren't set",
    });
  });

  it("global off, workspace override on: on for that workspace only", () => {
    const settings = { ...DEFAULT_GOOGLE_SURFACE_SETTINGS };
    const enabled = decideGoogleSurfaces({
      ...base,
      settings,
      overrides: { google_ai_overviews: true, google_ai_mode: null },
    });
    expect(enabled.google_ai_overviews).toEqual({
      on: true,
      reason: "On for this workspace (override)",
    });
    expect(enabled.google_ai_mode).toEqual({ on: false, reason: "Off in the global settings" });
    const other = decideGoogleSurfaces({ ...base, settings });
    expect(other.google_ai_overviews.on).toBe(false);
  });

  it("global on, workspace override off: off for that workspace", () => {
    const d = decideGoogleSurfaces({
      ...base,
      overrides: { google_ai_overviews: false, google_ai_mode: null },
    });
    expect(d.google_ai_overviews).toEqual({
      on: false,
      reason: "Off for this workspace (override)",
    });
    expect(d.google_ai_mode.on).toBe(true);
  });

  it("the tier rule: below Growth is off, the override included; Growth and up are on", () => {
    for (const tier of ["free", "starter"]) {
      const d = decideGoogleSurfaces({
        ...base,
        tier,
        overrides: { google_ai_overviews: true, google_ai_mode: true },
      });
      expect(d.google_ai_overviews, tier).toEqual({
        on: false,
        reason: "Off: the plan is below Growth",
      });
    }
    for (const tier of ["growth", "agency", "agency_pro", "enterprise"]) {
      expect(decideGoogleSurfaces({ ...base, tier }).google_ai_mode.on, tier).toBe(true);
    }
  });

  it("a sample audit never runs Google", () => {
    expect(decideGoogleSurfaces({ ...base, isSample: true }).google_ai_overviews.on).toBe(false);
  });
});

describe("parseGoogleSetting", () => {
  it("accepts each setting's own values and refuses the rest", () => {
    expect(parseGoogleSetting("aiModeEnabled", true)).toBe(true);
    expect(parseGoogleSetting("aiModeEnabled", "true")).toBeNull();
    expect(parseGoogleSetting("queueMode", "live")).toBe("live");
    expect(parseGoogleSetting("queueMode", "fast")).toBeNull();
    expect(parseGoogleSetting("device", "mobile")).toBe("mobile");
    expect(parseGoogleSetting("maxCostUsdPerAudit", "0.25")).toBe(0.25);
    expect(parseGoogleSetting("maxCostUsdPerAudit", -1)).toBeNull();
    expect(parseGoogleSetting("maxCostUsdPerAudit", 5)).toBeNull();
  });

  it("the defaults: everything off, standard queue, desktop, US$0.10 per audit", () => {
    expect(DEFAULT_GOOGLE_SURFACE_SETTINGS).toEqual({
      aiOverviewsEnabled: false,
      aiModeEnabled: false,
      countInHeadline: false,
      queueMode: "standard",
      device: "desktop",
      maxCostUsdPerAudit: 0.1,
    });
  });
});

describe("resolveGoogleSurfaces with the env switch off", () => {
  it("returns no surfaces and reads nothing (no setting, override or plan query)", async () => {
    vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "false");
    vi.stubEnv("DATAFORSEO_LOGIN", "set");
    vi.stubEnv("DATAFORSEO_PASSWORD", "set");
    const resolved = await resolveGoogleSurfaces("00000000-0000-0000-0000-000000000001");
    expect(resolved.surfaces).toEqual([]);
    expect(resolved.decisions.google_ai_mode.on).toBe(false);
    expect(queries.count).toBe(0);
  });

  it("unset is off too", async () => {
    vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "");
    expect((await resolveGoogleSurfaces("00000000-0000-0000-0000-000000000001")).surfaces).toEqual(
      [],
    );
    expect(queries.count).toBe(0);
  });

  it("on without credentials: off, logged by name only, still no query", async () => {
    vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "true");
    vi.stubEnv("DATAFORSEO_LOGIN", "");
    vi.stubEnv("DATAFORSEO_PASSWORD", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolved = await resolveGoogleSurfaces("00000000-0000-0000-0000-000000000001");
    expect(resolved.surfaces).toEqual([]);
    expect(queries.count).toBe(0);
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("google_surfaces_disabled_missing_credentials");
    warn.mockRestore();
  });
});
