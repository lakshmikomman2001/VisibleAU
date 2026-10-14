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
  const expectedTables = Number(process.env.EXPECTED_TABLES ?? 74);
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
