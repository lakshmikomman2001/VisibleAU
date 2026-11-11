/**
 * Google AI surfaces, Phase 1, part 1 -- the switches on a real database: resolveGoogleSurfaces's order
 * (env -> global setting -> workspace override -> plan) across three workspaces, and every change an
 * operator makes written to the change history, and a workspace override to that workspace's audit trail.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const GROWTH = randomUUID();
const OTHER_GROWTH = randomUUID();
const FREE = randomUUID();
const OPERATOR_ORG = randomUUID();
const OPERATOR = randomUUID();
const BRAND = randomUUID();
const STARTED = new Date();
const SETTING_KEYS = [
  "google_ai_overviews_enabled",
  "google_ai_mode_enabled",
  "google_surfaces_count_in_headline",
  "google_surfaces_queue_mode",
  "google_surfaces_device",
  "google_surfaces_max_cost_usd_per_audit",
];

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  const existing = await client`SELECT count(*)::int AS n FROM feature_settings`;
  if (existing[0].n > 0) throw new Error("feature_settings isn't empty on the test database");

  for (const [id, name] of [
    [GROWTH, "Switches Growth Co"],
    [OTHER_GROWTH, "Switches Other Growth Co"],
    [FREE, "Switches Free Co"],
    [OPERATOR_ORG, "Switches Operator Co"],
  ] as const) {
    await client`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${id}, ${`switches-${id}`}, ${name}, ${`switches-${id}`})
    `;
  }
  for (const id of [GROWTH, OTHER_GROWTH]) {
    await client`
      INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
      VALUES (${id}, ${`cus_${id}`}, ${`sub_${id}`}, 'price_test_growth', 'growth', 'monthly', 'active')
    `;
  }
  await client`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name)
    VALUES (${OPERATOR}, ${`operator-${OPERATOR}`}, ${OPERATOR_ORG}, 'operator@example.test', 'Operator Person')
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, suburb, state)
    VALUES (${BRAND}, ${GROWTH}, 'Switches Plumbing', 'switchesplumbing.example.com.au', 'tradies', 'au', 'Norwest', 'NSW')
  `;
  vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
  vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
}, 60_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await client`DELETE FROM feature_settings WHERE key = ANY(${SETTING_KEYS})`;
  await client`DELETE FROM feature_setting_changes WHERE created_at >= ${STARTED}`;
  await client`DELETE FROM users WHERE id = ${OPERATOR}`;
  for (const id of [GROWTH, OTHER_GROWTH, FREE, OPERATOR_ORG]) await deleteOrgRows(client, id);
  await client.end();
});

describe("Google AI surfaces switches (real database)", () => {
  it("env off: off for every workspace, even with the global setting and an override on", async () => {
    const gs = await import("@/lib/governance/google-surfaces");
    await gs.updateGoogleSurfaceSetting("aiModeEnabled", true, OPERATOR);
    await gs.setWorkspaceGoogleOverride(GROWTH, "google_ai_overviews", true, OPERATOR);
    vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "false");
    expect((await gs.resolveGoogleSurfaces(GROWTH)).surfaces).toEqual([]);
    await gs.updateGoogleSurfaceSetting("aiModeEnabled", false, OPERATOR);
  });

  it("env on, global off, the override on for one workspace: on there only; the plan rule still applies", async () => {
    const gs = await import("@/lib/governance/google-surfaces");
    vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "true");
    await gs.setWorkspaceGoogleOverride(FREE, "google_ai_overviews", true, OPERATOR);

    const growth = await gs.resolveGoogleSurfaces(GROWTH);
    expect(growth.surfaces).toEqual(["google_ai_overviews"]);
    expect(growth.decisions.google_ai_overviews.reason).toBe("On for this workspace (override)");
    expect(growth.decisions.google_ai_mode.reason).toBe("Off in the global settings");

    expect((await gs.resolveGoogleSurfaces(OTHER_GROWTH)).surfaces).toEqual([]);

    const free = await gs.resolveGoogleSurfaces(FREE);
    expect(free.surfaces).toEqual([]);
    expect(free.decisions.google_ai_overviews.reason).toBe("Off: the plan is below Growth");
  });

  it("the global setting on: every Growth workspace, and an off override wins; settings are read", async () => {
    const gs = await import("@/lib/governance/google-surfaces");
    vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "true");
    await gs.updateGoogleSurfaceSetting("aiModeEnabled", true, OPERATOR);
    await gs.updateGoogleSurfaceSetting("queueMode", "live", OPERATOR);
    await gs.updateGoogleSurfaceSetting("maxCostUsdPerAudit", "0.05", OPERATOR);
    await gs.setWorkspaceGoogleOverride(OTHER_GROWTH, "google_ai_mode", false, OPERATOR);

    const growth = await gs.resolveGoogleSurfaces(GROWTH);
    expect(growth.surfaces).toEqual(["google_ai_overviews", "google_ai_mode"]);
    expect(growth.settings.queueMode).toBe("live");
    expect(growth.settings.maxCostUsdPerAudit).toBe(0.05);
    expect((await gs.resolveGoogleSurfaces(OTHER_GROWTH)).surfaces).toEqual([]);

    // Back to the global setting: the override row is gone.
    await gs.setWorkspaceGoogleOverride(OTHER_GROWTH, "google_ai_mode", null, OPERATOR);
    expect((await gs.resolveGoogleSurfaces(OTHER_GROWTH)).surfaces).toEqual(["google_ai_mode"]);
    const flags = await client`
      SELECT flag_key FROM org_feature_flags WHERE organization_id = ${OTHER_GROWTH}
    `;
    expect(flags).toEqual([]);
  });

  it("a refused value changes nothing", async () => {
    const gs = await import("@/lib/governance/google-surfaces");
    await expect(gs.updateGoogleSurfaceSetting("queueMode", "fastest", OPERATOR)).rejects.toThrow(
      gs.GoogleSettingRejected,
    );
    await expect(gs.setBrandGooglePostcode(BRAND, "21530", OPERATOR)).rejects.toThrow(
      "An Australian postcode is four digits.",
    );
  });

  it("every change is in the history, who made it and when; an override is in that workspace's audit trail", async () => {
    const gs = await import("@/lib/governance/google-surfaces");
    await gs.setBrandGooglePostcode(BRAND, "2153", OPERATOR);
    expect(await gs.brandGooglePostcode(BRAND)).toBe("2153");

    const changes = await client`
      SELECT scope, setting_key, target_workspace_id, target_brand_id, old_value, new_value, changed_by_user_id
      FROM feature_setting_changes WHERE created_at >= ${STARTED} ORDER BY created_at
    `;
    expect(changes.every((c) => c.changed_by_user_id === OPERATOR)).toBe(true);
    expect(changes.map((c) => [c.scope, c.setting_key])).toEqual([
      ["global", "google_ai_mode_enabled"],
      ["workspace", "google_ai_overviews_enabled"],
      ["global", "google_ai_mode_enabled"],
      ["workspace", "google_ai_overviews_enabled"],
      ["global", "google_ai_mode_enabled"],
      ["global", "google_surfaces_queue_mode"],
      ["global", "google_surfaces_max_cost_usd_per_audit"],
      ["workspace", "google_ai_mode_enabled"],
      ["workspace", "google_ai_mode_enabled"],
      ["brand", "google_location_postcode"],
    ]);
    const brandChange = changes[changes.length - 1];
    expect([brandChange.target_brand_id, brandChange.old_value, brandChange.new_value]).toEqual([
      BRAND,
      null,
      { postcode: "2153" },
    ]);

    const trail = await client`
      SELECT action, resource_type, resource_id, user_id, metadata FROM audit_trail
      WHERE organization_id = ${GROWTH}
    `;
    expect(trail).toEqual([
      {
        action: "feature_flag_changed",
        resource_type: "feature_flag",
        resource_id: "google_ai_overviews_enabled",
        user_id: null,
        metadata: {
          flagKey: "google_ai_overviews_enabled",
          from: null,
          to: true,
          changedBy: "Vunnara team",
        },
      },
    ]);

    const view = await gs.loadGoogleSurfaceAdminView(GROWTH);
    expect(view.selected?.name).toBe("Switches Growth Co");
    expect(view.selected?.tier).toBe("growth");
    expect(view.selected?.brands).toEqual([
      { id: BRAND, name: "Switches Plumbing", suburb: "Norwest", state: "NSW", postcode: "2153" },
    ]);
    expect(view.history[0]).toMatchObject({
      scope: "brand",
      setting: "google_location_postcode",
      target: "Switches Plumbing",
      to: "2153",
      by: "operator@example.test",
    });
  });
});
