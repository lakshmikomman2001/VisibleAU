import { test, expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db } from "../../shared/db";

test.describe("F01: Schema — action_items + recommendation_research tables", () => {
  test("F01-01: action_items table exists with required columns", async () => {
    const cols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'action_items' ORDER BY column_name
    `);
    const names = new Set((cols as unknown as { column_name: string }[]).map((r) => r.column_name));
    for (const col of [
      "id", "organization_id", "brand_id", "audit_id", "recommendation_key",
      "dimension", "title", "action", "confidence_label", "expected_impact_score",
      "evidence_refs", "status", "dismissed_reason", "done_at", "dismissed_at",
      "created_at", "updated_at",
    ]) {
      expect(names.has(col), `column ${col} missing`).toBe(true);
    }
  });

  test("F01-02: recommendation_research table exists with required columns", async () => {
    const cols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'recommendation_research' ORDER BY column_name
    `);
    const names = new Set((cols as unknown as { column_name: string }[]).map((r) => r.column_name));
    for (const col of ["id", "recommendation_key", "source", "url", "summary", "confidence_level", "retrieved_at"]) {
      expect(names.has(col), `column ${col} missing`).toBe(true);
    }
  });

  test("F01-03: unique index on (audit_id, recommendation_key) exists on action_items", async () => {
    const result = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'action_items' AND indexname = 'action_items_audit_rec_idx'
    `);
    expect(result as unknown[]).toHaveLength(1);
  });

  test("F01-04: RLS is ENABLED on action_items (tenant data)", async () => {
    const result = await db.execute(sql`
      SELECT relrowsecurity FROM pg_class WHERE relname = 'action_items'
    `);
    const rows = result as unknown as { relrowsecurity: boolean }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].relrowsecurity, "RLS must be enabled on action_items").toBe(true);
  });

  test("F01-05: RLS is DISABLED on recommendation_research (global data)", async () => {
    const result = await db.execute(sql`
      SELECT relrowsecurity FROM pg_class WHERE relname = 'recommendation_research'
    `);
    const rows = result as unknown as { relrowsecurity: boolean }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].relrowsecurity, "RLS must be disabled on recommendation_research").toBe(false);
  });

  test("F01-06: index on recommendation_key exists on recommendation_research", async () => {
    const result = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'recommendation_research' AND indexname = 'recommendation_research_key_idx'
    `);
    expect(result as unknown[]).toHaveLength(1);
  });
});
