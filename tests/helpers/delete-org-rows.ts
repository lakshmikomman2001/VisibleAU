/**
 * Deletes every row a test workspace left behind: citations (keyed by audit, not organization), then
 * every base table with an organization_id column, retried over a few passes so foreign-key order
 * doesn't matter, then the organization itself. The same sweep tests/e2e/responsive/responsive-
 * shell.spec.ts uses, shared for integration tests that run whole audits.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import type postgres from "postgres";

export async function deleteOrgRows(
  sql: ReturnType<typeof postgres>,
  orgId: string,
): Promise<void> {
  await sql`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ${orgId})`;
  const tables = await sql<{ table_name: string }[]>`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'organization_id'
      AND t.table_type = 'BASE TABLE' AND c.table_name <> 'organizations'
  `;
  let pending = tables.map((t) => t.table_name);
  for (let pass = 0; pass < 6 && pending.length > 0; pass++) {
    const failed: string[] = [];
    for (const table of pending) {
      try {
        await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${orgId}`;
      } catch {
        failed.push(table);
      }
    }
    pending = failed;
  }
  await sql`DELETE FROM organizations WHERE id = ${orgId}`;
}
