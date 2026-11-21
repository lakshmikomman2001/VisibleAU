/**
 * S00 part 2 (22 Nov; LLD section 17): the feature flags on a real database, connected as visibleau_app (the
 * production role: no superuser, no RLS bypass), so the workspace override's FORCE RLS is really in force.
 * - every flag off by default; the global value turns one on; a workspace's override wins, either way; an expired
 *   override is none; "default" removes the override;
 * - every change is a Changes log row (feature_setting_changes), and a workspace override is also an entry in that
 *   workspace's Audit Trail; a save of the value in force writes nothing;
 * - one workspace's context never sees another's override; a closed or sample workspace can't be given one;
 * - /api/admin/feature-flags answers 403 to anyone but an operator, reading or writing, and writes nothing then.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalSafeDatabaseUrl } from "@/scripts/db/local-db-guard";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const admin = vi.hoisted(() => ({ allowed: false, userId: null as string | null }));
vi.mock("@/lib/auth/platform-admin", () => ({
  checkPlatformAdmin: async () => ({ allowed: admin.allowed, userId: admin.userId }),
}));

const SPLICE = randomUUID();
const OTHER = randomUUID();
const CLOSED = randomUUID();
const SAMPLE = randomUUID();
const OPERATOR_ORG = randomUUID();
const OPERATOR = randomUUID();
const OPERATOR_AUTH_ID = `flags-operator-${OPERATOR}`;
const STARTED = new Date(Date.now() - 1000);

let su: ReturnType<typeof postgres>;
let flagNames: readonly string[];

/** The production role, as db/client.ts connects in production (its local dev password). */
function appRoleUrl(): string {
  const base = new URL(getTestDatabaseUrl());
  base.username = "visibleau_app";
  base.password = "visibleau_app_dev";
  const url = base.toString();
  assertLocalSafeDatabaseUrl(url);
  return url;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  su = postgres(url, { max: 1 });
  process.env.DATABASE_URL = appRoleUrl();
  process.env.SERVICE_DATABASE_URL = url;
  flagNames = (await import("@/lib/flags/flags")).FLAG_NAMES;
  const existing =
    await su`SELECT count(*)::int AS n FROM feature_settings WHERE key = ANY(${[...flagNames]})`;
  if (existing[0].n > 0)
    throw new Error("feature_settings already has flag rows on the test database");

  for (const [id, name, slug, deleted] of [
    [SPLICE, "Flags Splice Co", `flags-${SPLICE}`, false],
    [OTHER, "Flags Other Co", `flags-${OTHER}`, false],
    [CLOSED, "Flags Closed Co", `flags-${CLOSED}`, true],
    [OPERATOR_ORG, "Flags Operator Co", `flags-${OPERATOR_ORG}`, false],
  ] as const) {
    await su`
      INSERT INTO organizations (id, clerk_org_id, name, slug, deleted_at)
      VALUES (${id}, ${`flags-${id}`}, ${name}, ${slug}, ${deleted ? new Date() : null})
    `;
  }
  // The free sample's workspace, if this database doesn't have one already (its slug is unique).
  const [sample] = await su<
    { id: string }[]
  >`SELECT id FROM organizations WHERE slug = '__sample__'`;
  if (!sample)
    await su`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${SAMPLE}, ${`flags-${SAMPLE}`}, 'Flags Sample', '__sample__')`;
  await su`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name)
    VALUES (${OPERATOR}, ${OPERATOR_AUTH_ID}, ${OPERATOR_ORG}, 'flags-operator@example.test', 'Flags Operator')
  `;
}, 60_000);

afterAll(async () => {
  await su`DELETE FROM feature_settings WHERE key = ANY(${[...flagNames]})`;
  await su`DELETE FROM feature_setting_changes WHERE created_at >= ${STARTED} AND setting_key = ANY(${[...flagNames]})`;
  await su`DELETE FROM users WHERE id = ${OPERATOR}`;
  for (const id of [SPLICE, OTHER, CLOSED, OPERATOR_ORG]) await deleteOrgRows(su, id);
  await su`DELETE FROM organizations WHERE id = ${SAMPLE}`;
  await su.end();
});

beforeEach(async () => {
  admin.allowed = false;
  admin.userId = null;
  await su`DELETE FROM feature_settings WHERE key = ANY(${[...flagNames]})`;
  await su`DELETE FROM org_feature_flags WHERE organization_id IN (${SPLICE}, ${OTHER}) AND flag_key = ANY(${[...flagNames]})`;
});

const changesFor = (flag: string) =>
  su<
    {
      scope: string;
      target_workspace_id: string | null;
      old_value: unknown;
      new_value: unknown;
      changed_by_user_id: string | null;
    }[]
  >`
    SELECT scope, target_workspace_id, old_value, new_value, changed_by_user_id FROM feature_setting_changes
    WHERE setting_key = ${flag} AND created_at >= ${STARTED} ORDER BY created_at`;

describe("feature flags (real database, as visibleau_app)", () => {
  it("every flag is off by default, for a workspace and for none", async () => {
    const { FLAG_NAMES, isEnabled } = await import("@/lib/flags/flags");
    for (const flag of FLAG_NAMES) {
      expect(await isEnabled(flag, SPLICE)).toBe(false);
      expect(await isEnabled(flag, null)).toBe(false);
    }
  });

  it("the global value turns a flag on for every workspace; the change is in the Changes log", async () => {
    const { isEnabled } = await import("@/lib/flags/flags");
    const { setGlobalFlag } = await import("@/lib/flags/admin");
    expect(await setGlobalFlag("report_v2", true, OPERATOR)).toBe("saved");
    expect(await isEnabled("report_v2", SPLICE)).toBe(true);
    expect(await isEnabled("report_v2", OTHER)).toBe(true);
    expect(await isEnabled("report_v2", null)).toBe(true);
    expect(await isEnabled("abn_suggestion", SPLICE)).toBe(false);
    const [row] =
      await su`SELECT value, updated_by_user_id FROM feature_settings WHERE key = 'report_v2'`;
    expect(row).toEqual({ value: true, updated_by_user_id: OPERATOR });
    expect(await changesFor("report_v2")).toEqual([
      {
        scope: "global",
        target_workspace_id: null,
        old_value: false,
        new_value: true,
        changed_by_user_id: OPERATOR,
      },
    ]);
    // Off again is a row too ("on -> off"); the value stays stored as false.
    expect(await setGlobalFlag("report_v2", false, OPERATOR)).toBe("saved");
    expect(await isEnabled("report_v2", SPLICE)).toBe(false);
    expect((await changesFor("report_v2")).at(-1)).toMatchObject({
      old_value: true,
      new_value: false,
    });
    await su`DELETE FROM feature_setting_changes WHERE setting_key = 'report_v2' AND created_at >= ${STARTED}`;
  });

  it("a workspace's override wins over the global value, either way, for that workspace only", async () => {
    const { isEnabled } = await import("@/lib/flags/flags");
    const { setGlobalFlag, setWorkspaceFlagOverride } = await import("@/lib/flags/admin");
    expect(await setWorkspaceFlagOverride(SPLICE, "visibility_reach", true, OPERATOR)).toBe(
      "saved",
    );
    expect(await isEnabled("visibility_reach", SPLICE)).toBe(true);
    expect(await isEnabled("visibility_reach", OTHER)).toBe(false);

    await setGlobalFlag("visibility_reach", true, OPERATOR);
    expect(await setWorkspaceFlagOverride(SPLICE, "visibility_reach", false, OPERATOR)).toBe(
      "saved",
    );
    expect(await isEnabled("visibility_reach", SPLICE)).toBe(false);
    expect(await isEnabled("visibility_reach", OTHER)).toBe(true);

    // "Default": the override is removed and the global value decides again.
    expect(await setWorkspaceFlagOverride(SPLICE, "visibility_reach", null, OPERATOR)).toBe(
      "saved",
    );
    expect(await isEnabled("visibility_reach", SPLICE)).toBe(true);
    const rows =
      await su`SELECT 1 FROM org_feature_flags WHERE organization_id = ${SPLICE} AND flag_key = 'visibility_reach'`;
    expect(rows.length).toBe(0);
    await su`DELETE FROM feature_setting_changes WHERE setting_key = 'visibility_reach' AND created_at >= ${STARTED}`;
  });

  it("an override is in the Changes log and in that workspace's Audit Trail, by the product's team", async () => {
    const { setWorkspaceFlagOverride } = await import("@/lib/flags/admin");
    await setWorkspaceFlagOverride(SPLICE, "question_library", true, OPERATOR);
    expect(await changesFor("question_library")).toEqual([
      {
        scope: "workspace",
        target_workspace_id: SPLICE,
        old_value: null,
        new_value: true,
        changed_by_user_id: OPERATOR,
      },
    ]);
    const trail = await su<
      {
        action: string;
        resource_type: string;
        resource_id: string;
        user_id: string | null;
        metadata: Record<string, unknown>;
      }[]
    >`
      SELECT action, resource_type, resource_id, user_id, metadata FROM audit_trail
      WHERE organization_id = ${SPLICE} AND resource_id = 'question_library'`;
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({
      action: "feature_flag_changed",
      resource_type: "feature_flag",
      user_id: null,
      metadata: { flagKey: "question_library", from: null, to: true },
    });
    expect(String(trail[0].metadata.changedBy)).toMatch(/ team$/);
    await su`DELETE FROM feature_setting_changes WHERE setting_key = 'question_library' AND created_at >= ${STARTED}`;
  });

  it("a save of the value already in force is 'unchanged' and writes nothing, globally or for a workspace", async () => {
    const { setGlobalFlag, setWorkspaceFlagOverride } = await import("@/lib/flags/admin");
    expect(await setGlobalFlag("qi_website", false, OPERATOR)).toBe("unchanged");
    expect(await setWorkspaceFlagOverride(SPLICE, "qi_website", null, OPERATOR)).toBe("unchanged");
    await setWorkspaceFlagOverride(SPLICE, "qi_website", true, OPERATOR);
    expect(await setWorkspaceFlagOverride(SPLICE, "qi_website", true, OPERATOR)).toBe("unchanged");
    expect(await changesFor("qi_website")).toHaveLength(1);
    const rows = await su`SELECT 1 FROM feature_settings WHERE key = 'qi_website'`;
    expect(rows.length).toBe(0);
    const trail =
      await su`SELECT 1 FROM audit_trail WHERE organization_id = ${SPLICE} AND resource_id = 'qi_website'`;
    expect(trail.length).toBe(1);
    await su`DELETE FROM feature_setting_changes WHERE setting_key = 'qi_website' AND created_at >= ${STARTED}`;
  });

  it("an expired override is none", async () => {
    const { isEnabled } = await import("@/lib/flags/flags");
    await su`
      INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled, expires_at)
      VALUES (${SPLICE}, 'qi_listings', true, now() - interval '1 minute')
    `;
    expect(await isEnabled("qi_listings", SPLICE)).toBe(false);
  });

  it("RLS: one workspace's context never sees another workspace's override", async () => {
    const { withRlsContext } = await import("@/db/client");
    const { orgFeatureFlags } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { setWorkspaceFlagOverride } = await import("@/lib/flags/admin");
    await setWorkspaceFlagOverride(SPLICE, "qi_demand", true, OPERATOR);
    const seen = await withRlsContext(OTHER, (tx) =>
      tx.select().from(orgFeatureFlags).where(eq(orgFeatureFlags.organizationId, SPLICE)),
    );
    expect(seen).toEqual([]);
    const own = await withRlsContext(SPLICE, (tx) =>
      tx.select().from(orgFeatureFlags).where(eq(orgFeatureFlags.organizationId, SPLICE)),
    );
    expect(own.map((r) => r.flagKey)).toContain("qi_demand");
    await su`DELETE FROM feature_setting_changes WHERE setting_key = 'qi_demand' AND created_at >= ${STARTED}`;
  });

  it("a closed workspace, the free sample's, or one that doesn't exist can't be given an override", async () => {
    const { FlagChangeRejected, setWorkspaceFlagOverride } = await import("@/lib/flags/admin");
    const [sample] = await su<
      { id: string }[]
    >`SELECT id FROM organizations WHERE slug = '__sample__'`;
    for (const id of [CLOSED, sample.id, randomUUID()]) {
      await expect(
        setWorkspaceFlagOverride(id, "qi_pretest", true, OPERATOR),
      ).rejects.toBeInstanceOf(FlagChangeRejected);
    }
    expect(await changesFor("qi_pretest")).toEqual([]);
  });

  it("the admin view: every flag, its global value, and for a chosen workspace its override and what it gets", async () => {
    const { loadFeatureFlagAdminView, setGlobalFlag, setWorkspaceFlagOverride } = await import(
      "@/lib/flags/admin"
    );
    await setGlobalFlag("report_v2", true, OPERATOR);
    await setWorkspaceFlagOverride(SPLICE, "report_v2", false, OPERATOR);
    const none = await loadFeatureFlagAdminView(null);
    expect(none.workspace).toBeNull();
    expect(none.flags).toHaveLength(13);
    expect(none.flags.find((f) => f.name === "report_v2")).toMatchObject({
      global: true,
      override: null,
      effective: null,
    });
    const splice = await loadFeatureFlagAdminView(SPLICE);
    expect(splice.workspace).toEqual({ id: SPLICE, name: "Flags Splice Co" });
    expect(splice.flags.find((f) => f.name === "report_v2")).toMatchObject({
      global: true,
      override: false,
      effective: false,
    });
    expect(splice.flags.find((f) => f.name === "abn_suggestion")).toMatchObject({
      global: false,
      override: null,
      effective: false,
    });
    expect((await loadFeatureFlagAdminView(CLOSED)).workspace).toBeNull();
    await su`DELETE FROM feature_setting_changes WHERE setting_key = 'report_v2' AND created_at >= ${STARTED}`;
  });
});

describe("/api/admin/feature-flags", () => {
  const get = (query = "") => new Request(`http://localhost/api/admin/feature-flags${query}`);
  const post = (body: unknown) =>
    new Request("http://localhost/api/admin/feature-flags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("403 to anyone but an operator, reading or writing, and nothing is written", async () => {
    const route = await import("@/app/api/admin/feature-flags/route");
    admin.allowed = false;
    admin.userId = "someone-signed-in";
    const read = await route.GET(get(`?workspace=${SPLICE}`));
    expect(read.status).toBe(403);
    expect(await read.json()).toEqual({ error: "Forbidden" });
    const write = await route.POST(post({ scope: "global", flag: "report_v2", enabled: true }));
    expect(write.status).toBe(403);
    const override = await route.POST(
      post({ scope: "workspace", workspaceId: SPLICE, flag: "report_v2", state: "on" }),
    );
    expect(override.status).toBe(403);
    expect(await su`SELECT 1 FROM feature_settings WHERE key = 'report_v2'`).toHaveLength(0);
    expect(
      await su`SELECT 1 FROM org_feature_flags WHERE organization_id = ${SPLICE} AND flag_key = 'report_v2'`,
    ).toHaveLength(0);
    expect(await changesFor("report_v2")).toEqual([]);
  });

  it("an operator reads the view and saves; the change is logged against the operator's profile", async () => {
    const route = await import("@/app/api/admin/feature-flags/route");
    admin.allowed = true;
    admin.userId = OPERATOR_AUTH_ID;
    const read = await route.GET(get(`?workspace=${SPLICE}`));
    expect(read.status).toBe(200);
    const view = await read.json();
    expect(view.workspace).toEqual({ id: SPLICE, name: "Flags Splice Co" });
    expect(view.flags).toHaveLength(13);

    const saved = await route.POST(
      post({ scope: "workspace", workspaceId: SPLICE, flag: "qi_competitors", state: "on" }),
    );
    expect(await saved.json()).toEqual({ ok: true, status: "saved" });
    const again = await route.POST(
      post({ scope: "workspace", workspaceId: SPLICE, flag: "qi_competitors", state: "on" }),
    );
    expect(await again.json()).toEqual({ ok: true, status: "unchanged" });
    expect(await changesFor("qi_competitors")).toEqual([
      {
        scope: "workspace",
        target_workspace_id: SPLICE,
        old_value: null,
        new_value: true,
        changed_by_user_id: OPERATOR,
      },
    ]);
    await su`DELETE FROM feature_setting_changes WHERE setting_key = 'qi_competitors' AND created_at >= ${STARTED}`;
  });

  it("400 for a flag that doesn't exist, a malformed change, or a closed workspace", async () => {
    const route = await import("@/app/api/admin/feature-flags/route");
    admin.allowed = true;
    admin.userId = OPERATOR_AUTH_ID;
    expect(
      (await route.POST(post({ scope: "global", flag: "free_tier_enabled", enabled: true })))
        .status,
    ).toBe(400);
    expect(
      (await route.POST(post({ scope: "global", flag: "report_v2", enabled: "yes" }))).status,
    ).toBe(400);
    const closed = await route.POST(
      post({ scope: "workspace", workspaceId: CLOSED, flag: "report_v2", state: "on" }),
    );
    expect(closed.status).toBe(400);
    expect(await closed.json()).toEqual({ error: "That workspace doesn't exist or is closed." });
  });
});
