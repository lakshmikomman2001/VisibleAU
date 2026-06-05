import { test, expect } from "@playwright/test";
import { sql } from "drizzle-orm";
import { db } from "../../shared/db";

test.describe("F01: Schema — vertical_packs + vertical_pack_prompts tables", () => {
  test("F01-01: vertical_packs table exists with required columns", async () => {
    const cols = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'vertical_packs'
      ORDER BY column_name
    `);
    const colMap = Object.fromEntries(
      (cols as unknown as { column_name: string }[]).map((r) => [r.column_name, r]),
    );
    expect(colMap.id, "id column missing").toBeTruthy();
    expect(colMap.vertical, "vertical column missing").toBeTruthy();
    expect(colMap.region, "region column missing").toBeTruthy();
    expect(colMap.version, "version column missing").toBeTruthy();
    expect(colMap.name, "name column missing").toBeTruthy();
    expect(colMap.prompts_count, "prompts_count column missing").toBeTruthy();
    expect(colMap.metadata, "metadata (jsonb) column missing").toBeTruthy();
    expect(colMap.published_at, "published_at column missing").toBeTruthy();
    expect(colMap.retired_at, "retired_at column missing").toBeTruthy();
    expect(colMap.updated_at, "updated_at column missing").toBeTruthy();
    expect(
      (colMap.retired_at as Record<string, string>).is_nullable,
      "retired_at must be nullable",
    ).toBe("YES");
  });

  test("F01-02: vertical_pack_prompts table exists with required columns", async () => {
    const cols = await db.execute(sql`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'vertical_pack_prompts'
      ORDER BY column_name
    `);
    const colMap = Object.fromEntries(
      (cols as unknown as { column_name: string }[]).map((r) => [r.column_name, r]),
    );
    expect(colMap.id, "id missing").toBeTruthy();
    expect(colMap.pack_id, "pack_id (FK) missing").toBeTruthy();
    expect(colMap.prompt_template, "prompt_template missing").toBeTruthy();
    expect(colMap.rank, "rank missing").toBeTruthy();
    expect(colMap.category, "category missing").toBeTruthy();
    expect(colMap.topic, "topic missing").toBeTruthy();
    expect(colMap.expected_mention_type, "expected_mention_type missing").toBeTruthy();
    expect(colMap.notes, "notes missing").toBeTruthy();
    expect(colMap.created_at, "created_at missing").toBeTruthy();
    expect((colMap.category as Record<string, string>).is_nullable).toBe("YES");
  });

  test("F01-03: unique index on (vertical, region) exists on vertical_packs", async () => {
    const result = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'vertical_packs'
        AND indexname = 'vertical_packs_vertical_region_idx'
    `);
    expect(result as unknown[]).toHaveLength(1);
  });

  test("F01-04: packId FK has onDelete CASCADE", async () => {
    const result = await db.execute(sql`
      SELECT rc.delete_rule
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu
        ON rc.constraint_name = kcu.constraint_name
      WHERE kcu.table_name = 'vertical_pack_prompts'
        AND kcu.column_name = 'pack_id'
    `);
    const rows = result as unknown as { delete_rule: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].delete_rule, "CASCADE delete rule expected").toBe("CASCADE");
  });

  test("F01-05: RLS is disabled on vertical_packs (global data)", async () => {
    const result = await db.execute(sql`
      SELECT relrowsecurity
      FROM pg_class
      WHERE relname = 'vertical_packs'
    `);
    const rows = result as unknown as { relrowsecurity: boolean }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].relrowsecurity, "RLS must be disabled on vertical_packs").toBe(false);
  });

  test("F01-06: RLS is disabled on vertical_pack_prompts", async () => {
    const result = await db.execute(sql`
      SELECT relrowsecurity
      FROM pg_class
      WHERE relname = 'vertical_pack_prompts'
    `);
    const rows = result as unknown as { relrowsecurity: boolean }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].relrowsecurity, "RLS must be disabled on vertical_pack_prompts").toBe(
      false,
    );
  });

  test("F01-07: db.query.verticalPacks is not undefined (relations registered)", async () => {
    const isRegistered = db.query.verticalPacks !== undefined;
    expect(
      isRegistered,
      "db.query.verticalPacks is undefined — add verticalPacksRelations to db/client.ts",
    ).toBe(true);
  });
});
