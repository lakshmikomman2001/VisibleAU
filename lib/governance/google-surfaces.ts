import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import {
  brandGoogleLocations,
  brands,
  featureSettingChanges,
  featureSettings,
  organizations,
  orgFeatureFlags,
  users,
} from "@/db/schema";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { tierRank } from "@/lib/pricing/tiers";
import { PRODUCT_NAME } from "@/lib/product";
import { hasGoogleSurfaceProviderCredentials } from "@/lib/serp/credentials";
import { recordAction } from "./audit-trail";
import {
  GOOGLE_SURFACES_ENV,
  googleSurfaceCredentialsPresent,
  googleSurfacesCanRun,
  googleSurfacesEnvEnabled,
} from "./google-surfaces-env";
import { MAX_COST_CEILING_USD } from "./google-surfaces-limits";

export { MAX_COST_CEILING_USD };

/**
 * Google AI surfaces, Phase 1, part 1 -- the switches for Google AI Overviews and Google AI Mode, and the
 * ONE place they're read (Sri, 1 Nov; tests/unit/google-surfaces/switch-readers.test.ts fails if any other
 * file reads the env switch, the settings tables or the two workspace flag keys).
 *
 * Resolution order, one function (resolveGoogleSurfaces), per surface:
 * 1. env kill switch GOOGLE_AI_SURFACES_ENABLED: anything but "true" is off, whatever the database says,
 *    and nothing else is read (no query at all, so an audit with it off runs exactly as before);
 * 2. the provider's credentials (lib/serp/credentials.ts): missing while enabled logs
 *    google_surfaces_disabled_missing_credentials (names only) and runs as off;
 * 3. the global setting (feature_settings; no row = off);
 * 4. the workspace override (org_feature_flags, google_ai_overviews_enabled / google_ai_mode_enabled):
 *    when a row exists it decides for that workspace, on or off, whatever the global setting says;
 * 5. the plan: Growth and up only (Sri's decision, 8 Nov), the override included.
 * A sample audit never runs Google.
 *
 * An audit calls it once, at its start, and stores what it got (lib/google-surfaces/dispatch.ts), so a
 * change applies to the next audit only.
 */

export const GOOGLE_SURFACES = ["google_ai_overviews", "google_ai_mode"] as const;
export type GoogleSurface = (typeof GOOGLE_SURFACES)[number];

export const GOOGLE_SURFACE_NAMES: Record<GoogleSurface, string> = {
  google_ai_overviews: "AI Overviews",
  google_ai_mode: "AI Mode",
};

/** The per-workspace override keys in org_feature_flags (google_ai_mode_enabled is canonical since sprint 8). */
export const GOOGLE_SURFACE_FLAG_KEYS: Record<GoogleSurface, string> = {
  google_ai_overviews: "google_ai_overviews_enabled",
  google_ai_mode: "google_ai_mode_enabled",
};

/** Sri's decision (8 Nov): Growth and up, and only where switched on. */
export const GOOGLE_SURFACES_MIN_TIER = "growth";

export type GoogleQueueMode = "standard" | "priority" | "live";
export type GoogleDevice = "desktop" | "mobile";

export interface GoogleSurfaceSettings {
  aiOverviewsEnabled: boolean;
  aiModeEnabled: boolean;
  /** Off by default and kept off for now (Sri, 8 Nov): Google is shown in its own block. */
  countInHeadline: boolean;
  queueMode: GoogleQueueMode;
  device: GoogleDevice;
  /** The audit stops posting Google questions once this would be passed, and says so. */
  maxCostUsdPerAudit: number;
}

export const DEFAULT_GOOGLE_SURFACE_SETTINGS: GoogleSurfaceSettings = {
  aiOverviewsEnabled: false,
  aiModeEnabled: false,
  countInHeadline: false,
  queueMode: "standard",
  device: "desktop",
  maxCostUsdPerAudit: 0.1,
};

/** feature_settings.key for each setting (the table's CHECK lists exactly these). */
export const GOOGLE_SETTING_KEYS = {
  aiOverviewsEnabled: "google_ai_overviews_enabled",
  aiModeEnabled: "google_ai_mode_enabled",
  countInHeadline: "google_surfaces_count_in_headline",
  queueMode: "google_surfaces_queue_mode",
  device: "google_surfaces_device",
  maxCostUsdPerAudit: "google_surfaces_max_cost_usd_per_audit",
} as const satisfies Record<keyof GoogleSurfaceSettings, string>;

export type GoogleSettingName = keyof GoogleSurfaceSettings;

const QUEUE_MODES: readonly GoogleQueueMode[] = ["standard", "priority", "live"];
const DEVICES: readonly GoogleDevice[] = ["desktop", "mobile"];

/** A stored or submitted value, checked; null when it isn't a valid value for the setting. */
export function parseGoogleSetting<K extends GoogleSettingName>(
  name: K,
  raw: unknown,
): GoogleSurfaceSettings[K] | null {
  switch (name) {
    case "aiOverviewsEnabled":
    case "aiModeEnabled":
    case "countInHeadline":
      return (typeof raw === "boolean" ? raw : null) as GoogleSurfaceSettings[K] | null;
    case "queueMode":
      return (QUEUE_MODES.includes(raw as GoogleQueueMode) ? raw : null) as
        | GoogleSurfaceSettings[K]
        | null;
    case "device":
      return (DEVICES.includes(raw as GoogleDevice) ? raw : null) as
        | GoogleSurfaceSettings[K]
        | null;
    case "maxCostUsdPerAudit": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
      return (Number.isFinite(n) && n >= 0 && n <= MAX_COST_CEILING_USD ? n : null) as
        | GoogleSurfaceSettings[K]
        | null;
    }
    default:
      return null;
  }
}

export { GOOGLE_SURFACES_ENV, googleSurfacesCanRun, googleSurfacesEnvEnabled };

export interface GoogleSurfaceDecision {
  on: boolean;
  /** Why, in words the admin page shows. */
  reason: string;
}

export interface GoogleSurfaceInputs {
  envEnabled: boolean;
  credentialsPresent: boolean;
  isSample: boolean;
  settings: GoogleSurfaceSettings;
  /** The workspace override per surface; null = no override row. */
  overrides: Record<GoogleSurface, boolean | null>;
  tier: string | null;
}

/** The resolution order above, as a pure function of its inputs. */
export function decideGoogleSurfaces(
  inputs: GoogleSurfaceInputs,
): Record<GoogleSurface, GoogleSurfaceDecision> {
  const decide = (surface: GoogleSurface): GoogleSurfaceDecision => {
    if (!inputs.envEnabled)
      return { on: false, reason: `Off: ${GOOGLE_SURFACES_ENV} isn't "true"` };
    if (!inputs.credentialsPresent) {
      return { on: false, reason: "Off: the provider's credentials aren't set" };
    }
    if (inputs.isSample) return { on: false, reason: "Off: sample audits never run Google" };
    const global =
      surface === "google_ai_overviews"
        ? inputs.settings.aiOverviewsEnabled
        : inputs.settings.aiModeEnabled;
    const override = inputs.overrides[surface];
    const wanted = override ?? global;
    if (!wanted) {
      return {
        on: false,
        reason:
          override === false ? "Off for this workspace (override)" : "Off in the global settings",
      };
    }
    if (inputs.tier === null || tierRank(inputs.tier) < tierRank(GOOGLE_SURFACES_MIN_TIER)) {
      return { on: false, reason: "Off: the plan is below Growth" };
    }
    return {
      on: true,
      reason: override === true ? "On for this workspace (override)" : "On in the global settings",
    };
  };
  return {
    google_ai_overviews: decide("google_ai_overviews"),
    google_ai_mode: decide("google_ai_mode"),
  };
}

export async function readGoogleSurfaceSettings(): Promise<GoogleSurfaceSettings> {
  const rows = await serviceDb
    .select({ key: featureSettings.key, value: featureSettings.value })
    .from(featureSettings)
    .where(inArray(featureSettings.key, Object.values(GOOGLE_SETTING_KEYS)));
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const settings = { ...DEFAULT_GOOGLE_SURFACE_SETTINGS };
  for (const name of Object.keys(GOOGLE_SETTING_KEYS) as GoogleSettingName[]) {
    if (!byKey.has(GOOGLE_SETTING_KEYS[name])) continue;
    const parsed = parseGoogleSetting(name, byKey.get(GOOGLE_SETTING_KEYS[name]));
    if (parsed !== null) (settings as Record<GoogleSettingName, unknown>)[name] = parsed;
  }
  return settings;
}

async function readWorkspaceOverrides(
  orgId: string,
): Promise<Record<GoogleSurface, boolean | null>> {
  const rows = await serviceDb
    .select({
      key: orgFeatureFlags.flagKey,
      enabled: orgFeatureFlags.isEnabled,
      expiresAt: orgFeatureFlags.expiresAt,
    })
    .from(orgFeatureFlags)
    .where(
      and(
        eq(orgFeatureFlags.organizationId, orgId),
        inArray(orgFeatureFlags.flagKey, Object.values(GOOGLE_SURFACE_FLAG_KEYS)),
      ),
    );
  const now = new Date();
  const out: Record<GoogleSurface, boolean | null> = {
    google_ai_overviews: null,
    google_ai_mode: null,
  };
  for (const surface of GOOGLE_SURFACES) {
    const row = rows.find((r) => r.key === GOOGLE_SURFACE_FLAG_KEYS[surface]);
    // An expired override is no override (lib/governance/feature-flags.ts's rule).
    if (row && !(row.expiresAt && row.expiresAt < now)) out[surface] = row.enabled;
  }
  return out;
}

export interface ResolvedGoogleSurfaces {
  /** The surfaces this audit runs, in display order; empty = Google is off for it. */
  surfaces: GoogleSurface[];
  decisions: Record<GoogleSurface, GoogleSurfaceDecision>;
  settings: GoogleSurfaceSettings;
}

const ENV_OFF: Omit<ResolvedGoogleSurfaces, "decisions"> = {
  surfaces: [],
  settings: DEFAULT_GOOGLE_SURFACE_SETTINGS,
};

/**
 * Which Google surfaces an audit for this workspace runs, and with which settings. With the env switch
 * off it returns at once, reading nothing.
 */
export async function resolveGoogleSurfaces(
  orgId: string,
  opts: { tier?: string; isSample?: boolean } = {},
): Promise<ResolvedGoogleSurfaces> {
  const envEnabled = googleSurfacesEnvEnabled();
  const baseInputs = {
    isSample: opts.isSample === true,
    settings: DEFAULT_GOOGLE_SURFACE_SETTINGS,
    overrides: { google_ai_overviews: null, google_ai_mode: null },
    tier: opts.tier ?? null,
  };
  if (!envEnabled) {
    return {
      ...ENV_OFF,
      decisions: decideGoogleSurfaces({ ...baseInputs, envEnabled, credentialsPresent: false }),
    };
  }
  const hasCredentials = googleSurfaceCredentialsPresent();
  if (!hasCredentials || opts.isSample) {
    return {
      ...ENV_OFF,
      decisions: decideGoogleSurfaces({
        ...baseInputs,
        envEnabled,
        credentialsPresent: hasCredentials,
      }),
    };
  }
  const [settings, overrides, tier] = await Promise.all([
    readGoogleSurfaceSettings(),
    readWorkspaceOverrides(orgId),
    opts.tier !== undefined ? Promise.resolve(opts.tier) : effectiveTier(serviceDb, orgId),
  ]);
  const decisions = decideGoogleSurfaces({
    envEnabled,
    credentialsPresent: hasCredentials,
    isSample: false,
    settings,
    overrides,
    tier,
  });
  return { surfaces: GOOGLE_SURFACES.filter((s) => decisions[s].on), decisions, settings };
}

/** The operator-set postcode for a brand (brands have no postcode column), or null. */
export async function brandGooglePostcode(brandId: string): Promise<string | null> {
  const [row] = await serviceDb
    .select({ postcode: brandGoogleLocations.postcode })
    .from(brandGoogleLocations)
    .where(eq(brandGoogleLocations.brandId, brandId));
  return row?.postcode ?? null;
}

// ---------------------------------------------------------------------------------------------
// The operator's admin page (/admin/settings): what's set, the effective state for one workspace,
// and every change. Only reached after checkPlatformAdmin (lib/auth/platform-admin.ts).
// ---------------------------------------------------------------------------------------------

/** The operator's own profile row (users.id) for a better-auth user id, for the change history. */
export async function operatorProfileId(betterAuthUserId: string | null): Promise<string | null> {
  if (!betterAuthUserId) return null;
  const [row] = await serviceDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, betterAuthUserId));
  return row?.id ?? null;
}

export interface GoogleSurfaceHistoryEntry {
  at: string;
  scope: "global" | "workspace" | "brand";
  setting: string;
  target: string | null;
  from: unknown;
  to: unknown;
  by: string | null;
}

export interface GoogleSurfaceAdminView {
  envEnabled: boolean;
  credentialsPresent: boolean;
  settings: GoogleSurfaceSettings;
  workspaces: { id: string; name: string }[];
  selected: {
    id: string;
    name: string;
    tier: string;
    overrides: Record<GoogleSurface, boolean | null>;
    /** What an audit started now would run. */
    now: Record<GoogleSurface, GoogleSurfaceDecision>;
    /** The same, were the env switch on (it's the one setting this page can't change). */
    withEnvOn: Record<GoogleSurface, GoogleSurfaceDecision>;
    brands: {
      id: string;
      name: string;
      suburb: string | null;
      state: string | null;
      postcode: string | null;
    }[];
  } | null;
  history: GoogleSurfaceHistoryEntry[];
}

/** A brand postcode change is stored as { postcode } (see setBrandGooglePostcode); shown as the postcode. */
function unwrapPostcode(value: unknown): unknown {
  return value && typeof value === "object" && "postcode" in value
    ? (value as { postcode: unknown }).postcode
    : value;
}

export async function loadGoogleSurfaceAdminView(
  selectedOrgId: string | null,
): Promise<GoogleSurfaceAdminView> {
  const envEnabled = googleSurfacesEnvEnabled();
  const hasCredentials = hasGoogleSurfaceProviderCredentials();
  const settings = await readGoogleSurfaceSettings();
  const workspaces = await serviceDb
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(isNull(organizations.deletedAt))
    .orderBy(organizations.name);

  let selected: GoogleSurfaceAdminView["selected"] = null;
  const workspace = workspaces.find((w) => w.id === selectedOrgId);
  if (workspace) {
    const [overrides, tier] = await Promise.all([
      readWorkspaceOverrides(workspace.id),
      effectiveTier(serviceDb, workspace.id),
    ]);
    const inputs = { isSample: false, settings, overrides, tier };
    const brandRows = await serviceDb
      .select({
        id: brands.id,
        name: brands.name,
        suburb: brands.suburb,
        state: brands.state,
        postcode: brandGoogleLocations.postcode,
      })
      .from(brands)
      .leftJoin(brandGoogleLocations, eq(brandGoogleLocations.brandId, brands.id))
      .where(and(eq(brands.organizationId, workspace.id), isNull(brands.deletedAt)))
      .orderBy(brands.name);
    selected = {
      ...workspace,
      tier,
      overrides,
      now: decideGoogleSurfaces({ ...inputs, envEnabled, credentialsPresent: hasCredentials }),
      withEnvOn: decideGoogleSurfaces({
        ...inputs,
        envEnabled: true,
        credentialsPresent: hasCredentials,
      }),
      brands: brandRows,
    };
  }

  const changes = await serviceDb
    .select({
      at: featureSettingChanges.createdAt,
      scope: featureSettingChanges.scope,
      setting: featureSettingChanges.settingKey,
      workspace: organizations.name,
      brand: brands.name,
      from: featureSettingChanges.oldValue,
      to: featureSettingChanges.newValue,
      by: users.email,
    })
    .from(featureSettingChanges)
    .leftJoin(organizations, eq(organizations.id, featureSettingChanges.targetWorkspaceId))
    .leftJoin(brands, eq(brands.id, featureSettingChanges.targetBrandId))
    .leftJoin(users, eq(users.id, featureSettingChanges.changedByUserId))
    .orderBy(desc(featureSettingChanges.createdAt))
    .limit(50);

  return {
    envEnabled,
    credentialsPresent: hasCredentials,
    settings,
    workspaces,
    selected,
    history: changes.map((c) => ({
      at: c.at.toISOString(),
      scope: c.scope,
      setting: c.setting,
      target: c.brand ?? c.workspace ?? null,
      from: unwrapPostcode(c.from),
      to: unwrapPostcode(c.to),
      by: c.by,
    })),
  };
}

/**
 * 12 Nov, part 5: what a save did. A save whose value is the one already in force (Sri saved Omega's
 * postcode 15 times; 14 log rows read 2153 -> 2153) is "unchanged": nothing is written, not even to the
 * change history. The rows already logged stay: the log is a history.
 */
export type GoogleSaveResult = "saved" | "unchanged";

export class GoogleSettingRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleSettingRejected";
  }
}

/**
 * Sets one global setting and writes the change history. The value in force (the stored one, else the
 * default) again is "unchanged" and writes nothing.
 */
export async function updateGoogleSurfaceSetting(
  name: GoogleSettingName,
  value: unknown,
  actorUserId: string | null,
): Promise<GoogleSaveResult> {
  const parsed = parseGoogleSetting(name, value);
  if (parsed === null) throw new GoogleSettingRejected(`That isn't a valid value for ${name}.`);
  const key = GOOGLE_SETTING_KEYS[name];
  return serviceDb.transaction(async (tx) => {
    const [before] = await tx
      .select({ value: featureSettings.value })
      .from(featureSettings)
      .where(eq(featureSettings.key, key));
    const inForce =
      (before ? parseGoogleSetting(name, before.value) : null) ??
      DEFAULT_GOOGLE_SURFACE_SETTINGS[name];
    if (inForce === parsed) return "unchanged";
    await tx
      .insert(featureSettings)
      .values({ key, value: parsed, updatedByUserId: actorUserId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: featureSettings.key,
        set: { value: parsed, updatedByUserId: actorUserId, updatedAt: new Date() },
      });
    await tx.insert(featureSettingChanges).values({
      scope: "global",
      settingKey: key,
      oldValue: before?.value ?? null,
      newValue: parsed,
      changedByUserId: actorUserId,
    });
    return "saved";
  });
}

/**
 * Turns a surface on or off for one workspace, or removes the override (null: the global setting
 * decides again). Written to the change history and to that workspace's own audit trail, which says
 * the product's team changed it (the operator's account isn't shown to the customer).
 */
export async function setWorkspaceGoogleOverride(
  orgId: string,
  surface: GoogleSurface,
  state: boolean | null,
  actorUserId: string | null,
): Promise<GoogleSaveResult> {
  const flagKey = GOOGLE_SURFACE_FLAG_KEYS[surface];
  const [workspace] = await serviceDb
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)));
  if (!workspace) throw new GoogleSettingRejected("That workspace doesn't exist or is closed.");
  const before = (await readWorkspaceOverrides(orgId))[surface];
  // The override already in force: nothing to write, in the history or the workspace's audit trail.
  if (before === state) return "unchanged";
  await serviceDb.transaction(async (tx) => {
    if (state === null) {
      await tx
        .delete(orgFeatureFlags)
        .where(
          and(eq(orgFeatureFlags.organizationId, orgId), eq(orgFeatureFlags.flagKey, flagKey)),
        );
    } else {
      await tx
        .insert(orgFeatureFlags)
        .values({
          organizationId: orgId,
          flagKey,
          isEnabled: state,
          reason: "Set on /admin/settings",
          setBy: actorUserId,
        })
        .onConflictDoUpdate({
          target: [orgFeatureFlags.organizationId, orgFeatureFlags.flagKey],
          set: { isEnabled: state, setBy: actorUserId, expiresAt: null, updatedAt: new Date() },
        });
    }
    await tx.insert(featureSettingChanges).values({
      scope: "workspace",
      settingKey: flagKey,
      targetWorkspaceId: orgId,
      oldValue: before,
      newValue: state,
      changedByUserId: actorUserId,
    });
  });
  await recordAction({
    organizationId: orgId,
    userId: null,
    action: "feature_flag_changed",
    resourceType: "feature_flag",
    resourceId: flagKey,
    metadata: { flagKey, from: before, to: state, changedBy: `${PRODUCT_NAME} team` },
  });
  return "saved";
}

/** Sets (or, with null, removes) the postcode Google results for a brand are located at. */
export async function setBrandGooglePostcode(
  brandId: string,
  postcode: string | null,
  actorUserId: string | null,
): Promise<GoogleSaveResult> {
  const value = postcode?.trim() || null;
  if (value !== null && !/^\d{4}$/.test(value)) {
    throw new GoogleSettingRejected("An Australian postcode is four digits.");
  }
  const [brand] = await serviceDb
    .select({ id: brands.id, organizationId: brands.organizationId })
    .from(brands)
    .where(and(eq(brands.id, brandId), isNull(brands.deletedAt)));
  if (!brand) throw new GoogleSettingRejected("That brand doesn't exist.");
  const before = await brandGooglePostcode(brandId);
  if (before === value) return "unchanged";
  await serviceDb.transaction(async (tx) => {
    if (value === null) {
      await tx.delete(brandGoogleLocations).where(eq(brandGoogleLocations.brandId, brandId));
    } else {
      await tx
        .insert(brandGoogleLocations)
        .values({
          brandId,
          organizationId: brand.organizationId,
          postcode: value,
          updatedByUserId: actorUserId,
        })
        .onConflictDoUpdate({
          target: brandGoogleLocations.brandId,
          set: { postcode: value, updatedByUserId: actorUserId, updatedAt: new Date() },
        });
    }
    await tx.insert(featureSettingChanges).values({
      scope: "brand",
      settingKey: "google_location_postcode",
      targetWorkspaceId: brand.organizationId,
      targetBrandId: brandId,
      // Wrapped: a bare "2153" in a jsonb column comes back from Drizzle as the number 2153.
      oldValue: before === null ? null : { postcode: before },
      newValue: value === null ? null : { postcode: value },
      changedByUserId: actorUserId,
    });
  });
  return "saved";
}
