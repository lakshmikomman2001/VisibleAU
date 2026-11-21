import { and, eq, inArray, isNull } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { notTheSampleWorkspace } from "@/db/open-workspace";
import { organizations, orgFeatureFlags } from "@/db/schema";
import { recordAction } from "@/lib/governance/audit-trail";
import { logFeatureFlagOverride, saveFeatureFlagSetting } from "@/lib/governance/google-surfaces";
import { PRODUCT_NAME } from "@/lib/product";
import {
  decideFlag,
  FLAG_NAMES,
  FLAGS,
  type FlagName,
  type FlagValues,
  isFlagName,
  storedGlobalFlagValues,
} from "./flags";

/**
 * S00 part 2 (22 Nov; LLD section 17): the operator's side of the feature flags, behind /admin/settings's "Feature
 * flags" card and /api/admin/feature-flags (operators only; the route checks, these functions trust their caller).
 *
 * - A global value is a feature_settings row (key = the flag, value true/false); turning one off writes false, so
 *   the history reads "on -> off".
 * - A workspace override is an org_feature_flags row, written under that workspace's own RLS context; "default"
 *   deletes it, so the global value decides again.
 * - Every change is a feature_setting_changes row (the Changes log on the same page), and an override is also an
 *   entry in that workspace's Audit Trail, in the same transaction (the operator's account isn't shown to the
 *   customer: "{product} team"). A save of the value already in force is "unchanged" and writes nothing at all,
 *   as for the Google settings (19 Nov).
 */

export type FlagSaveResult = "saved" | "unchanged";

export class FlagChangeRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlagChangeRejected";
  }
}

export interface FeatureFlagAdminRow {
  name: FlagName;
  gates: string;
  sprint: string;
  /** The global value (no row: off). */
  global: boolean;
  /** The chosen workspace's override in force; null = none (the global value decides). */
  override: boolean | null;
  /** What that workspace gets; null when no workspace is chosen. */
  effective: boolean | null;
}

export interface FeatureFlagAdminView {
  flags: FeatureFlagAdminRow[];
  workspace: { id: string; name: string } | null;
}

/** The global values, read now (not the per-request cache: a save compares with what's stored). */
const storedGlobalValues = storedGlobalFlagValues;

/** The open (not closed, not the free sample's) workspace with this id, under its own RLS context; null if none. */
async function openWorkspace(orgId: string): Promise<{ id: string; name: string } | null> {
  const [row] = await withRlsContext(orgId, (tx) =>
    tx
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(
        and(eq(organizations.id, orgId), isNull(organizations.deletedAt), notTheSampleWorkspace()),
      ),
  );
  return row ?? null;
}

/** The workspace's overrides in force (an expired one is none), under its RLS context. */
async function storedOverrides(orgId: string): Promise<FlagValues> {
  const rows = await withRlsContext(orgId, (tx) =>
    tx
      .select({
        flagKey: orgFeatureFlags.flagKey,
        isEnabled: orgFeatureFlags.isEnabled,
        expiresAt: orgFeatureFlags.expiresAt,
      })
      .from(orgFeatureFlags)
      .where(
        and(
          eq(orgFeatureFlags.organizationId, orgId),
          inArray(orgFeatureFlags.flagKey, [...FLAG_NAMES]),
        ),
      ),
  );
  const now = new Date();
  const values: FlagValues = {};
  for (const row of rows) {
    if (row.expiresAt && row.expiresAt < now) continue;
    if (isFlagName(row.flagKey)) values[row.flagKey] = row.isEnabled;
  }
  return values;
}

/** Every flag with its global value, and, for a chosen workspace, its override and what it gets. */
export async function loadFeatureFlagAdminView(
  workspaceId: string | null,
): Promise<FeatureFlagAdminView> {
  const workspace = workspaceId ? await openWorkspace(workspaceId) : null;
  const [globals, overrides] = await Promise.all([
    storedGlobalValues(),
    workspace ? storedOverrides(workspace.id) : Promise.resolve<FlagValues>({}),
  ]);
  return {
    workspace,
    flags: FLAGS.map((f) => ({
      name: f.name,
      gates: f.gates,
      sprint: f.sprint,
      global: globals[f.name] ?? false,
      override: workspace ? (overrides[f.name] ?? null) : null,
      effective: workspace ? decideFlag(globals[f.name], overrides[f.name]) : null,
    })),
  };
}

/** Turns a flag on or off for every workspace without an override of its own. */
export async function setGlobalFlag(
  flag: FlagName,
  enabled: boolean,
  actorUserId: string | null,
): Promise<FlagSaveResult> {
  const before = (await storedGlobalValues())[flag] ?? false;
  if (before === enabled) return "unchanged";
  await saveFeatureFlagSetting(flag, enabled, before, actorUserId);
  return "saved";
}

/**
 * Turns a flag on or off for one workspace, or (null) removes its override so the global value decides. Written
 * under the workspace's RLS context, with its history row and its Audit Trail entry in the same transaction.
 */
export async function setWorkspaceFlagOverride(
  orgId: string,
  flag: FlagName,
  state: boolean | null,
  actorUserId: string | null,
): Promise<FlagSaveResult> {
  const workspace = await openWorkspace(orgId);
  if (!workspace) throw new FlagChangeRejected("That workspace doesn't exist or is closed.");
  const before = (await storedOverrides(orgId))[flag] ?? null;
  if (before === state) return "unchanged";
  await withRlsContext(orgId, async (tx) => {
    if (state === null) {
      await tx
        .delete(orgFeatureFlags)
        .where(and(eq(orgFeatureFlags.organizationId, orgId), eq(orgFeatureFlags.flagKey, flag)));
    } else {
      await tx
        .insert(orgFeatureFlags)
        .values({
          organizationId: orgId,
          flagKey: flag,
          isEnabled: state,
          reason: "Set on /admin/settings",
          setBy: actorUserId,
        })
        .onConflictDoUpdate({
          target: [orgFeatureFlags.organizationId, orgFeatureFlags.flagKey],
          set: { isEnabled: state, setBy: actorUserId, expiresAt: null, updatedAt: new Date() },
        });
    }
    await logFeatureFlagOverride(tx, { key: flag, orgId, before, after: state, actorUserId });
    await recordAction(
      {
        organizationId: orgId,
        userId: null,
        action: "feature_flag_changed",
        resourceType: "feature_flag",
        resourceId: flag,
        metadata: { flagKey: flag, from: before, to: state, changedBy: `${PRODUCT_NAME} team` },
      },
      tx,
    );
  });
  return "saved";
}
