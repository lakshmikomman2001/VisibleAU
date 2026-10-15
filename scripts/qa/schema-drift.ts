/**
 * Compares the Drizzle TS schema (db/schema/index.ts) against the live columns,
 * unique/FK constraints, and indexes of a real database.
 *
 * This is the check `drizzle-kit generate`/`check` cannot do here: this repo's
 * Drizzle snapshot tracking is stuck at migration 0011 (migrations 0012+ are
 * hand-written and applied via `psql -f`, never fed back into drizzle-kit's
 * metadata), so drizzle-kit's own drift detection is unusable — see
 * db/migrations/README.md.
 *
 * Usage:
 *   DATABASE_URL_FOR_DRIFT=postgresql://... pnpm db:drift
 *
 * Exit code 1 on any FATAL (a column the TS schema needs that the live DB
 * doesn't have — this is exactly the class of bug that caused the 0010
 * baseline-reconcile no-op incident). WARN-level findings (extra live
 * columns, type/nullability mismatches, constraint/index name mismatches)
 * are informational only and do not fail the run.
 *
 * Task #46 (9th follow-up): the type comparison reads the live side from
 * `pg_catalog` (`format_type(atttypid, atttypmod)`) instead of
 * `information_schema.columns.data_type`/`udt_name` -- the latter collapses
 * EVERY array column to the literal string `"ARRAY"` with the element type
 * thrown away, which made `text[]`/`integer[]` columns permanently
 * unmatchable against anything and forced the old comparison to fall back
 * to a lossy "strip precision, allow either side to be a string-prefix of
 * the other" heuristic just to stay usable. `format_type` returns the exact
 * canonical type Postgres itself would print (`text[]`, `numeric(5,2)`,
 * `timestamp without time zone`), so the expected side has to match it
 * exactly too: `canonicalPgType()` lowercases Drizzle's own
 * `col.getSQLType()` (already correct for arrays, precision, and
 * `withTimezone`), tightens `numeric(5, 2)`'s comma-space to match
 * `format_type`'s `numeric(5,2)`, and maps Drizzle's short-form `"timestamp"`
 * to the canonical `"timestamp without time zone"` -- the one abbreviation
 * `getSQLType()` uses that `format_type` never does. Verified against every
 * column in the live schema (956 columns, 0 false positives) and against
 * two deliberately-introduced real mismatches (a dropped time zone, a
 * `text` column retyped to `integer`) on a throwaway database -- both
 * caught by exact column name, nothing else flagged alongside them. See
 * docs/ops/post-launch-db-hardening.md section 46 (9th follow-up).
 */
import { is } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "../../db/schema";

interface LiveColumn {
  column_name: string;
  format_type: string;
  is_nullable: boolean;
}

/** Postgres's own canonical type spelling, e.g. `format_type(atttypid, atttypmod)` would print it. */
export function canonicalPgType(raw: string): string {
  let t = raw.toLowerCase().trim();
  t = t.replace(/,\s+/g, ","); // "numeric(5, 2)" -> "numeric(5,2)"
  if (t === "timestamp") t = "timestamp without time zone"; // Drizzle's short form for no-tz timestamps
  return t;
}

function tsSqlType(col: ReturnType<typeof getTableConfig>["columns"][number]): string {
  try {
    return canonicalPgType(col.getSQLType());
  } catch {
    return canonicalPgType(col.columnType);
  }
}

function liveSqlType(live: LiveColumn): string {
  return canonicalPgType(live.format_type);
}

export interface DriftResult {
  fatals: string[];
  warns: string[];
  tableCount: number;
  liveTableCount: number;
  liveTableCountExpected: number;
  livePolicyCount: number;
  livePolicyCountExpected: number;
}

// Task #46 (12th follow-up): tables with real customer data that AREN'T
// caught by the "has organization_id" derivation in checkRlsCoverage()
// below because they're scoped transitively through a foreign key, not
// a direct column -- each still needs RLS, just not via the direct
// `organization_id = current_setting(...)` shape the column-based check
// assumes. Added here, by name, with how each is actually isolated.
const RLS_TRANSITIVE_ORG_TABLES: Record<string, string> = {
  citations:
    "scoped via audit_id -> audits.organization_id; has its own EXISTS-subquery policies referencing app.current_org_id",
  organizations:
    "the org row itself, scoped via id = current_setting('app.current_org_id') directly",
};

// Tables genuinely global/platform-wide -- no organization_id column, and
// deliberately no per-org RLS isolation, because there is no customer-
// specific data in them to isolate. This list is documentation, not a
// suppression: checkRlsCoverage() derives its "needs RLS" set purely from
// organization_id presence + RLS_TRANSITIVE_ORG_TABLES, so a table here
// that quietly grew an organization_id column would start failing the
// check on its own (correctly) rather than staying silently exempted.
const RLS_EXEMPT_GLOBAL_TABLES: Record<string, string> = {
  ai_bot_ip_ranges: "vendor-published CIDR ranges, shared across all customers",
  ai_bot_registry: "vendor/bot registry, shared across all customers",
  auth_accounts: "better-auth OAuth provider accounts, scoped per user not per org",
  auth_organizations:
    "better-auth's own org identity row (mirrors app organizations.id via clerk_org_id) -- not customer data to isolate on its own",
  auth_sessions: "better-auth sessions, scoped per user not per org",
  auth_users: "better-auth user identity, scoped per user not per org",
  auth_verifications: "better-auth ephemeral verification tokens, no org link",
  canary_prompts: "platform-wide drift-detection canaries, not customer data",
  citability_methods: "global citability methodology reference data",
  config_bundle_cache: "platform-wide market/locale/segment config bundles",
  llm_response_cache: "shared LLM response cache across all customers (cost optimization)",
  market_ai_budget_policies: "global AU_EN platform budget policy reference",
  metric_quality_gates: "global platform metric-quality reference",
  processed_webhook_events: "global Stripe webhook idempotency ledger, dedup by event id only",
  prompt_pack_coverage: "global platform prompt-pack coverage reference",
  prompt_volume_estimates: "global platform prompt-volume reference",
  provider_market_capabilities: "global platform provider-capability reference",
  rate_limit_counters: "anonymous caller rate-limit counters keyed by hashed IP, not by tenant",
  recommendation_research: "shared cached research/citations data, not customer-specific",
  sampling_policies: "global platform sampling-policy reference",
  validation_corpus_results: "internal test/validation fixture results, not customer data",
  vertical_pack_prompts: "global platform vertical prompt-pack reference",
  vertical_packs: "global platform vertical-pack reference",
};

export interface RlsCoverageResult {
  missingEnableOrForce: string[];
  missingOrgPolicy: string[];
  rlsEnabledNoOrgId: string[];
  exemptTablesNowOrgScoped: string[];
}

/**
 * For every table that's org-scoped (has `organization_id`, or is listed in
 * RLS_TRANSITIVE_ORG_TABLES), confirms RLS is enabled, forced, and has at
 * least one policy referencing `app.current_org_id`. A table created by a
 * hand-written migration without its policy leaks across orgs silently --
 * this is the automated check for exactly that.
 */
export async function checkRlsCoverage(sql: postgres.Sql): Promise<RlsCoverageResult> {
  const orgIdTables = await sql<{ table_name: string }[]>`
    SELECT DISTINCT c.relname AS table_name
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attname = 'organization_id'
      AND a.attnum > 0 AND NOT a.attisdropped
  `;
  const orgScopedSet = new Set<string>([
    ...orgIdTables.map((r) => r.table_name),
    ...Object.keys(RLS_TRANSITIVE_ORG_TABLES),
  ]);

  const rlsInfo = await sql<
    { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
  >`
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `;
  const rlsMap = new Map(rlsInfo.map((r) => [r.relname, r]));

  const policies = await sql<
    { tablename: string; qual: string | null; with_check: string | null }[]
  >`
    SELECT tablename, qual, with_check FROM pg_policies WHERE schemaname = 'public'
  `;
  const policiesByTable = new Map<string, { qual: string | null; with_check: string | null }[]>();
  for (const p of policies) {
    const list = policiesByTable.get(p.tablename) ?? [];
    list.push(p);
    policiesByTable.set(p.tablename, list);
  }
  const hasOrgPolicy = (tableName: string): boolean =>
    (policiesByTable.get(tableName) ?? []).some(
      (p) =>
        p.qual?.includes("app.current_org_id") === true ||
        p.with_check?.includes("app.current_org_id") === true,
    );

  const missingEnableOrForce: string[] = [];
  const missingOrgPolicy: string[] = [];
  for (const tableName of orgScopedSet) {
    const rls = rlsMap.get(tableName);
    if (!rls || !rls.relrowsecurity || !rls.relforcerowsecurity) {
      missingEnableOrForce.push(tableName);
      continue;
    }
    if (!hasOrgPolicy(tableName)) {
      missingOrgPolicy.push(tableName);
    }
  }

  const rlsEnabledNoOrgId = rlsInfo
    .filter((r) => r.relrowsecurity && !orgScopedSet.has(r.relname))
    .map((r) => r.relname);

  // A documented-exempt table that quietly grew an organization_id column
  // would already be caught normally (it's now in orgScopedSet, and fails
  // missingEnableOrForce/missingOrgPolicy like any other table lacking
  // protection) -- this surfaces it with a clearer, specific reason too,
  // instead of leaving it to read as an unexplained generic failure.
  const exemptTablesNowOrgScoped = Object.keys(RLS_EXEMPT_GLOBAL_TABLES)
    .filter((t) => orgIdTables.some((r) => r.table_name === t))
    .sort();

  return {
    missingEnableOrForce: missingEnableOrForce.sort(),
    missingOrgPolicy: missingOrgPolicy.sort(),
    rlsEnabledNoOrgId: rlsEnabledNoOrgId.sort(),
    exemptTablesNowOrgScoped,
  };
}

export async function checkSchemaDrift(dbUrl: string): Promise<DriftResult> {
  const sql = postgres(dbUrl, { max: 1 });

  // Drizzle infers a distinct literal-typed variant per table export (e.g. name: "ai_referral_hits"
  // rather than name: string), so no single type predicate structurally reconciles against the
  // whole union of schema exports. `is()` still does the correct runtime check; the result is cast
  // to AnyPgTable[] afterward rather than asking `.filter()`'s type-predicate overload to validate
  // narrowing across ~80 distinct literal table types.
  const tables = Object.values(schema).filter((v) => is(v, PgTable)) as unknown as AnyPgTable[];

  const fatals: string[] = [];
  const warns: string[] = [];

  for (const table of tables) {
    const config = getTableConfig(table);
    const tableName = config.name;

    const liveCols = (await sql<LiveColumn[]>`
      SELECT a.attname AS column_name,
        format_type(a.atttypid, a.atttypmod) AS format_type,
        NOT a.attnotnull AS is_nullable
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ${tableName}
        AND a.attnum > 0 AND NOT a.attisdropped
    `) as unknown as LiveColumn[];

    if (liveCols.length === 0) {
      const liveTableExists = await sql`SELECT to_regclass('public.' || ${tableName}) AS reg`;
      if (!liveTableExists[0]?.reg) {
        fatals.push(`${tableName}: table does not exist live`);
        continue;
      }
    }

    const liveColMap = new Map(liveCols.map((c) => [c.column_name, c]));
    const tsColNames = new Set(config.columns.map((c) => c.name));

    for (const col of config.columns) {
      const live = liveColMap.get(col.name);
      if (!live) {
        fatals.push(`${tableName}.${col.name}: present in TS schema, absent live`);
        continue;
      }

      if (col.notNull !== !live.is_nullable) {
        warns.push(
          `${tableName}.${col.name}: nullability mismatch (TS notNull=${col.notNull}, live is_nullable=${live.is_nullable})`,
        );
      }

      const tsType = tsSqlType(col);
      const liveType = liveSqlType(live);
      if (tsType !== liveType) {
        warns.push(`${tableName}.${col.name}: type mismatch (TS=${tsType}, live=${liveType})`);
      }
    }

    for (const liveCol of liveCols) {
      if (!tsColNames.has(liveCol.column_name)) {
        warns.push(
          `${tableName}.${liveCol.column_name}: live only, absent in TS schema (may be intentional legacy)`,
        );
      }
    }

    // Unique constraints: inline column-level .unique() + table-level unique()
    const expectedUniqueNames = new Set<string>();
    for (const col of config.columns) {
      if (col.isUnique && col.uniqueName) expectedUniqueNames.add(col.uniqueName);
    }
    for (const uq of config.uniqueConstraints) {
      const name = uq.getName();
      if (name) expectedUniqueNames.add(name);
    }
    // Foreign keys
    const expectedFkNames = new Set<string>();
    for (const fk of config.foreignKeys) {
      expectedFkNames.add(fk.getName());
    }

    if (expectedUniqueNames.size > 0 || expectedFkNames.size > 0) {
      const liveConstraints = await sql<{ conname: string }[]>`
        SELECT conname FROM pg_constraint
        WHERE conrelid = ('public.' || ${tableName})::regclass AND contype IN ('u', 'f')
      `;
      const liveConstraintNames = new Set(liveConstraints.map((c) => c.conname));
      for (const name of expectedUniqueNames) {
        if (!liveConstraintNames.has(name)) {
          warns.push(
            `${tableName}: expected unique constraint "${name}" not found live (checked by name)`,
          );
        }
      }
      for (const name of expectedFkNames) {
        if (!liveConstraintNames.has(name)) {
          warns.push(
            `${tableName}: expected foreign key "${name}" not found live (checked by name)`,
          );
        }
      }
    }

    // Indexes declared in the table's extraConfig
    if (config.indexes.length > 0) {
      const liveIndexes = await sql<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${tableName}
      `;
      const liveIndexNames = new Set(liveIndexes.map((i) => i.indexname));
      for (const idx of config.indexes) {
        const name = idx.config.name;
        if (name && !liveIndexNames.has(name)) {
          warns.push(`${tableName}: expected index "${name}" not found live (checked by name)`);
        }
      }
    }
  }

  // Launch invariants: total public base-table count and total RLS policy count.
  // FATAL on mismatch — these are the two numbers this project's deploy verification
  // has always checked by hand (74 tables / 208 policies); asserting them here means a
  // migration that silently changes either fails the build instead of being missed.
  // Override via env when a migration deliberately changes these numbers.
  const expectedTables = Number(process.env.EXPECTED_TABLES ?? 75);
  const expectedPolicies = Number(process.env.EXPECTED_POLICIES ?? 208);

  const [{ table_count }] = await sql<{ table_count: number }[]>`
    SELECT count(*)::int AS table_count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const [{ policy_count }] = await sql<{ policy_count: number }[]>`
    SELECT count(*)::int AS policy_count FROM pg_policies WHERE schemaname = 'public'
  `;

  if (table_count !== expectedTables) {
    fatals.push(
      `launch invariant: public base-table count is ${table_count}, expected ${expectedTables} (override with EXPECTED_TABLES)`,
    );
  }
  if (policy_count !== expectedPolicies) {
    fatals.push(
      `launch invariant: RLS policy count is ${policy_count}, expected ${expectedPolicies} (override with EXPECTED_POLICIES)`,
    );
  }

  // Launch vertical packs: migrations create vertical_packs/vertical_pack_prompts
  // but seed no rows (see db/migrations/README.md, "Seeding"). A fresh DB built
  // from migrations only — exactly what happened on Neon prod (H) — has the
  // tables but zero packs, which silently blocks the brand wizard (no
  // selectable vertical) and would make a real audit generate zero prompts.
  // FATAL if any launch region/vertical is missing a non-retired pack, or that
  // pack has zero prompt rows.
  const launchRegions = (process.env.LAUNCH_REGIONS ?? "au").split(",").map((s) => s.trim());
  const launchVerticals = (process.env.LAUNCH_VERTICALS ?? "tradies,allied_health,saas")
    .split(",")
    .map((s) => s.trim());

  const packRows = await sql<{ vertical: string; region: string; prompt_rows: number }[]>`
    SELECT p.vertical, p.region, count(vp.id)::int AS prompt_rows
    FROM vertical_packs p
    LEFT JOIN vertical_pack_prompts vp ON vp.pack_id = p.id
    WHERE p.retired_at IS NULL
    GROUP BY p.vertical, p.region
  `;

  for (const region of launchRegions) {
    for (const vertical of launchVerticals) {
      const row = packRows.find((r) => r.region === region && r.vertical === vertical);
      if (!row) {
        fatals.push(
          `launch invariant: no active vertical_packs row for ${vertical}/${region} (override launch list with LAUNCH_REGIONS/LAUNCH_VERTICALS)`,
        );
      } else if (row.prompt_rows === 0) {
        fatals.push(
          `launch invariant: vertical_packs row for ${vertical}/${region} has 0 vertical_pack_prompts rows`,
        );
      }
    }
  }

  // Task #46 (12th follow-up): a table created by a hand-written migration
  // without its org-scoping RLS policy leaks across orgs silently -- FATAL,
  // not WARN, same severity class as a missing column.
  const rls = await checkRlsCoverage(sql);
  if (rls.missingEnableOrForce.length > 0) {
    fatals.push(
      `RLS: tables missing ENABLE/FORCE row-level security: ${rls.missingEnableOrForce.join(", ")}`,
    );
  }
  if (rls.missingOrgPolicy.length > 0) {
    fatals.push(
      `RLS: tables missing a policy referencing app.current_org_id: ${rls.missingOrgPolicy.join(", ")}`,
    );
  }
  if (rls.exemptTablesNowOrgScoped.length > 0) {
    fatals.push(
      `RLS: table(s) documented as global-exempt in RLS_EXEMPT_GLOBAL_TABLES now have an organization_id column -- re-review and either add RLS or update the exemption: ${rls.exemptTablesNowOrgScoped.join(", ")}`,
    );
  }
  if (rls.rlsEnabledNoOrgId.length > 0) {
    warns.push(
      `RLS: tables with RLS enabled but no organization_id column (review): ${rls.rlsEnabledNoOrgId.join(", ")}`,
    );
  }

  await sql.end();

  return {
    fatals,
    warns,
    tableCount: tables.length,
    liveTableCount: table_count,
    liveTableCountExpected: expectedTables,
    livePolicyCount: policy_count,
    livePolicyCountExpected: expectedPolicies,
  };
}

async function main() {
  const dbUrl = process.env.DATABASE_URL_FOR_DRIFT;
  if (!dbUrl) {
    console.error("DATABASE_URL_FOR_DRIFT is not set.");
    process.exit(1);
  }

  const label = process.env.DRIFT_LABEL ?? "database";
  const {
    fatals,
    warns,
    tableCount,
    liveTableCount,
    liveTableCountExpected,
    livePolicyCount,
    livePolicyCountExpected,
  } = await checkSchemaDrift(dbUrl);

  console.log(`\n=== schema-drift: ${label} (${tableCount} TS tables checked) ===\n`);
  console.log(
    `Launch invariants: ${liveTableCount} tables (expected ${liveTableCountExpected}), ${livePolicyCount} policies (expected ${livePolicyCountExpected})\n`,
  );

  if (fatals.length > 0) {
    console.log(`FATAL (${fatals.length}):`);
    for (const f of fatals) console.log(`  ✗ ${f}`);
    console.log("");
  }

  if (warns.length > 0) {
    console.log(`WARN (${warns.length}):`);
    for (const w of warns) console.log(`  ⚠ ${w}`);
    console.log("");
  }

  if (fatals.length === 0) {
    console.log("No FATAL drift.");
  }

  if (fatals.length > 0) {
    process.exit(1);
  }
}

// Only run as a CLI when invoked directly (not when imported by a test).
if (process.argv[1] && process.argv[1].endsWith("schema-drift.ts")) {
  main().catch((err) => {
    console.error("schema-drift failed:", err);
    process.exit(1);
  });
}
