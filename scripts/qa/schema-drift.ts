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
 */
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "../../db/schema";

interface LiveColumn {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
}

function normalizeType(t: string): string {
  return t
    .toLowerCase()
    .replace(/\(\d+(,\s*\d+)?\)/g, "") // strip precision/scale, e.g. numeric(5,2) -> numeric
    .trim();
}

function tsSqlType(col: ReturnType<typeof getTableConfig>["columns"][number]): string {
  try {
    return normalizeType(col.getSQLType());
  } catch {
    return normalizeType(col.columnType);
  }
}

function liveSqlType(live: LiveColumn): string {
  const raw = live.data_type === "USER-DEFINED" ? live.udt_name : live.data_type;
  return normalizeType(raw);
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

  const tables = Object.values(schema).filter((v): v is PgTable => is(v, PgTable));

  const fatals: string[] = [];
  const warns: string[] = [];

  for (const table of tables) {
    const config = getTableConfig(table);
    const tableName = config.name;

    const liveCols = (await sql<LiveColumn[]>`
      SELECT column_name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
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

      const liveNotNull = live.is_nullable === "NO";
      if (col.notNull !== liveNotNull) {
        warns.push(
          `${tableName}.${col.name}: nullability mismatch (TS notNull=${col.notNull}, live is_nullable=${live.is_nullable})`,
        );
      }

      const tsType = tsSqlType(col);
      const liveType = liveSqlType(live);
      if (tsType !== liveType && !tsType.startsWith(liveType) && !liveType.startsWith(tsType)) {
        warns.push(`${tableName}.${col.name}: type mismatch (TS=${tsType}, live=${liveType})`);
      }
    }

    for (const liveCol of liveCols) {
      if (!tsColNames.has(liveCol.column_name)) {
        warns.push(`${tableName}.${liveCol.column_name}: live only, absent in TS schema (may be intentional legacy)`);
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
          warns.push(`${tableName}: expected unique constraint "${name}" not found live (checked by name)`);
        }
      }
      for (const name of expectedFkNames) {
        if (!liveConstraintNames.has(name)) {
          warns.push(`${tableName}: expected foreign key "${name}" not found live (checked by name)`);
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
  const { fatals, warns, tableCount, liveTableCount, liveTableCountExpected, livePolicyCount, livePolicyCountExpected } =
    await checkSchemaDrift(dbUrl);

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
