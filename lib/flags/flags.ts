import { and, eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { withRlsContext } from "@/db/client";
import { orgFeatureFlags } from "@/db/schema";
import { readFeatureFlagSettings } from "@/lib/governance/google-surfaces";

/**
 * S00 part 2 (22 Nov; LLD section 17): the client-enhancements feature flags. Every new behaviour from S01 on ships
 * behind one of these, and each is OFF until Sri turns it on: for one workspace first (a workspace override),
 * then per plan. Off means the app is exactly as it was.
 *
 * Stored where /admin/settings already keeps Google AI's switches (docs/lld/as-is-verification.md, 1.4):
 * - the global value: a feature_settings row, key = the flag's name, value true or false (no row: off), read and
 *   written through lib/governance/google-surfaces.ts, the store's one module, by the flags' own keys only;
 * - a workspace override: an org_feature_flags row (flag_key = the name; FORCE RLS, read under the workspace's own
 *   RLS context); an expired one is no override, as lib/governance/feature-flags.ts has it;
 * - every change: feature_setting_changes, written by lib/flags/admin.ts (operators only) through the same module.
 *
 * The override wins over the global value, either way. Flags never change data.
 */
export const FLAG_NAMES = [
  "report_v2",
  "abn_suggestion",
  "question_library",
  "agency_questions",
  "visibility_reach",
  "business_taxonomy",
  "qi_website",
  "qi_listings",
  "qi_demand",
  "qi_competitors",
  "qi_pretest",
  "qi_learning",
  "question_packs",
] as const;

export type FlagName = (typeof FLAG_NAMES)[number];

export interface FlagSpec {
  name: FlagName;
  /** What the flag turns on, for the operator's settings page. */
  gates: string;
  sprint: string;
}

/** LLD section 17's table, in its order. */
export const FLAGS: readonly FlagSpec[] = [
  {
    name: "report_v2",
    gates:
      "Report v2: what to do next, beyond AI answers, the report contents panel, report tiers and portal reports",
    sprint: "S01",
  },
  { name: "abn_suggestion", gates: "ABN suggestion by business name", sprint: "S01" },
  { name: "question_library", gates: "The brand's Questions tab", sprint: "S02" },
  {
    name: "agency_questions",
    gates: "Editing, writing and applying questions; the Questions settings page",
    sprint: "S03",
  },
  {
    name: "visibility_reach",
    gates: "Visibility reach: the reach card, questions and results per reach",
    sprint: "S04",
  },
  { name: "business_taxonomy", gates: "The business type picker and custom types", sprint: "S05" },
  { name: "qi_website", gates: "Question intelligence: the website layer", sprint: "S06" },
  { name: "qi_listings", gates: "Question intelligence: the listings layer", sprint: "S07" },
  { name: "qi_demand", gates: "Question intelligence: local search demand", sprint: "S08" },
  { name: "qi_competitors", gates: "Question intelligence: competitors", sprint: "S08" },
  { name: "qi_pretest", gates: "Question intelligence: the pre-test", sprint: "S08" },
  { name: "qi_learning", gates: "Question intelligence: learning from results", sprint: "S09" },
  { name: "question_packs", gates: "Question packs on billing and pricing", sprint: "S10" },
];

export function isFlagName(value: unknown): value is FlagName {
  return typeof value === "string" && (FLAG_NAMES as readonly string[]).includes(value);
}

export type FlagValues = Partial<Record<FlagName, boolean>>;

/** A flag's state: the workspace's override when it has one, else the global value, else off. */
export function decideFlag(
  globalValue: boolean | undefined,
  override: boolean | undefined,
): boolean {
  return override ?? globalValue ?? false;
}

/** The global values that are set (true or false). A stored value that isn't a boolean counts as unset (off). */
export async function storedGlobalFlagValues(): Promise<FlagValues> {
  // The settings store's one module reads the table (tests/unit/google-surfaces/switch-readers.test.ts).
  const stored = await readFeatureFlagSettings(FLAG_NAMES);
  const values: FlagValues = {};
  for (const [key, value] of stored)
    if (isFlagName(key) && typeof value === "boolean") values[key] = value;
  return values;
}

/** storedGlobalFlagValues, read once per request. */
export const readGlobalFlagValues = cache(storedGlobalFlagValues);

/** One workspace's overrides in force (an expired one is none), read under that workspace's RLS context. */
export const readWorkspaceFlagOverrides = cache(async (orgId: string): Promise<FlagValues> => {
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
});

/**
 * Whether `flag` is on for the workspace `orgId` (null: no workspace, so the global value alone). Read once per
 * request (React's cache) however many times it's asked. If the settings can't be read, the flag is off: the app as
 * it was, never a half-on feature.
 */
export async function isEnabled(flag: FlagName, orgId: string | null): Promise<boolean> {
  try {
    const [globals, overrides] = await Promise.all([
      readGlobalFlagValues(),
      orgId ? readWorkspaceFlagOverrides(orgId) : Promise.resolve<FlagValues>({}),
    ]);
    return decideFlag(globals[flag], overrides[flag]);
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "feature_flag_read_failed",
        flag,
        orgId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return false;
  }
}
