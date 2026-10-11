-- READ-ONLY precheck for task #46's NO_CITATIONS_SOURCE_TYPE sentinel
-- ("__no_citations__") -- a new VALUE, not a new column, written into
-- citation_source_intelligence.source_type (and never into
-- citations.cited_source_type -- that column is only ever set by
-- classify-citation-sources.ts from a real classified[0] result, which
-- the sentinel never passes through).
--
-- Nothing in this file writes anything. NOT run from Claude Code -- Sri
-- runs this in the Neon SQL editor and sends the result back.
--
-- WHAT THE RESULT MEANS:
--   - Query 1 (data type): expect "text" / no udt_name of an enum type.
--     If it says anything other than a plain text/varchar type, STOP --
--     the sentinel write would need a different approach.
--   - Query 2 (CHECK constraints): expect ZERO ROWS for both tables.
--     Any row returned here that restricts source_type/cited_source_type
--     to a fixed value list means STOP -- the sentinel insert would
--     fail against that constraint, which (per task #46's replace-set
--     design) would roll back the WHOLE aggregate savepoint, not just
--     the one row -- the screen would keep showing stale data. Do not
--     push until this is resolved (migration + prod-fix files, or drop
--     the sentinel-row design).
--   - Query 3 (enum labels): expect ZERO ROWS. Any label returned means
--     the column is backed by a Postgres ENUM type even if
--     information_schema's reported data_type looked like text (this
--     can happen) -- STOP, same reasoning as above.
--   - Query 4 (current distinct values): informational only -- lists
--     what source_type strings already exist in prod. Expect the usual
--     category names (au_directory, review_site, other, brand_owned,
--     industry_association, government_regulator, etc.) and NOT
--     "__no_citations__" yet (this task hasn't pushed). If queries 1-3
--     all come back clean, this list is purely informational.
--
-- "Safe to push": query 1 shows a plain text type, AND queries 2 and 3
-- both return zero rows.
-- "Stop, don't push": query 2 or 3 returns any row, or query 1 shows
-- anything other than a plain text type.

-- 1. Column data type for both tables' relevant columns.
SELECT table_name, column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE (table_name = 'citation_source_intelligence' AND column_name = 'source_type')
   OR (table_name = 'citations' AND column_name = 'cited_source_type');

-- 2. Any CHECK constraint on either table (not just ones targeting
-- these specific columns -- a table-level CHECK could still reference
-- them in its definition, so this lists every CHECK on both tables and
-- the human reviewing the output should read each definition).
SELECT
  rel.relname AS table_name,
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE con.contype = 'c' -- CHECK constraints only
  AND rel.relname IN ('citation_source_intelligence', 'citations');

-- 3. Enum labels, in case either column's udt_name (query 1) names a
-- user-defined enum type rather than a built-in text type.
SELECT t.typname, e.enumlabel
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN (
  SELECT udt_name FROM information_schema.columns
  WHERE (table_name = 'citation_source_intelligence' AND column_name = 'source_type')
     OR (table_name = 'citations' AND column_name = 'cited_source_type')
);

-- 4. Informational only: current distinct source_type values in prod.
SELECT source_type, count(*) AS row_count
FROM citation_source_intelligence
GROUP BY source_type
ORDER BY row_count DESC;
