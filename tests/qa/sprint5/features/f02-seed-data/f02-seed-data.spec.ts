import { test, expect } from "@playwright/test";
import { eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "../../shared/db";
import { getRealPack } from "../../shared/seed";

test.describe("F02: Seed data — 336 prompts across 3 AU vertical packs", () => {
  test("F02-01: vertical_packs has exactly 3 active rows (tradies, allied_health, saas)", async () => {
    const packs = await db
      .select()
      .from(schema.verticalPacks)
      .where(isNull(schema.verticalPacks.retiredAt));
    const realPacks = packs.filter((p) =>
      ["tradies", "allied_health", "saas"].includes(p.vertical),
    );
    expect(realPacks).toHaveLength(3);
    const verticals = realPacks.map((p) => p.vertical).sort();
    expect(verticals).toEqual(["allied_health", "saas", "tradies"]);
  });

  test("F02-02: AU Tradies pack has exactly 124 prompts and matching promptsCount", async () => {
    const pack = await getRealPack("tradies");
    expect(pack, "Tradies pack not found — run pnpm seed").toBeDefined();
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.verticalPackPrompts)
      .where(eq(schema.verticalPackPrompts.packId, pack!.id));
    expect(count).toBe(124);
    expect(pack!.promptsCount, "promptsCount cache does not match actual count").toBe(124);
  });

  test("F02-03: AU Allied Health pack has exactly 104 prompts and matching promptsCount", async () => {
    const pack = await getRealPack("allied_health");
    expect(pack, "Allied Health pack not found — run pnpm seed").toBeDefined();
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.verticalPackPrompts)
      .where(eq(schema.verticalPackPrompts.packId, pack!.id));
    expect(count).toBe(104);
    expect(pack!.promptsCount).toBe(104);
  });

  test("F02-04: AU SaaS pack has exactly 108 prompts and matching promptsCount", async () => {
    const pack = await getRealPack("saas");
    expect(pack, "SaaS pack not found — run pnpm seed").toBeDefined();
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.verticalPackPrompts)
      .where(eq(schema.verticalPackPrompts.packId, pack!.id));
    expect(count).toBe(108);
    expect(pack!.promptsCount).toBe(108);
  });

  test("F02-05: total vertical_pack_prompts count is 336", async () => {
    const packs = await db
      .select({ id: schema.verticalPacks.id })
      .from(schema.verticalPacks)
      .where(isNull(schema.verticalPacks.retiredAt));
    const realPacks = packs.filter((p) => true);
    let total = 0;
    for (const pack of realPacks) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.verticalPackPrompts)
        .where(eq(schema.verticalPackPrompts.packId, pack.id));
      total += count;
    }
    expect(total, "Total prompt count must be 336 (124+104+108)").toBe(336);
  });

  test("F02-06: All prompts have non-null rank, promptTemplate, and expectedMentionType", async () => {
    const badRows = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM vertical_pack_prompts
      WHERE rank IS NULL
         OR prompt_template IS NULL
         OR prompt_template = ''
         OR expected_mention_type IS NULL
    `);
    expect(
      (badRows as unknown as { count: number }[])[0].count,
      "Some prompts have null rank/template/expectedMentionType",
    ).toBe(0);
  });

  test("F02-07: All prompts have rank >= 1 (no zero-based ranks)", async () => {
    const badRanks = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM vertical_pack_prompts WHERE rank < 1
    `);
    expect(
      (badRanks as unknown as { count: number }[])[0].count,
      "Some prompts have rank < 1",
    ).toBe(0);
  });

  test("F02-08: expectedMentionType values are canonical (recommended|listed|comparison)", async () => {
    const badTypes = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM vertical_pack_prompts
      WHERE expected_mention_type NOT IN ('recommended', 'listed', 'comparison')
    `);
    expect(
      (badTypes as unknown as { count: number }[])[0].count,
      "Non-canonical expectedMentionType values found",
    ).toBe(0);
  });

  test("F02-09: Tradies pack has all 8 expected categories represented", async () => {
    const pack = await getRealPack("tradies");
    const cats = await db.execute(sql`
      SELECT DISTINCT category FROM vertical_pack_prompts
      WHERE pack_id = ${pack!.id} AND category IS NOT NULL
    `);
    const catSet = new Set((cats as unknown as { category: string }[]).map((r) => r.category));
    const expected = [
      "service-discovery",
      "recommendation",
      "comparison",
      "service-specific",
      "emergency",
      "pricing",
      "reviews",
      "compliance",
    ];
    for (const cat of expected) {
      expect(catSet.has(cat), `Category "${cat}" missing from Tradies pack`).toBe(true);
    }
  });

  test("F02-10: Seed idempotency — unique constraint prevents duplicate packs", async () => {
    let threw = false;
    try {
      await db.insert(schema.verticalPacks).values({
        vertical: "tradies" as never,
        region: "au" as never,
        name: "Duplicate Test",
        version: "v1.0",
        promptsCount: 0,
        metadata: {},
        updatedAt: new Date(),
      });
    } catch {
      threw = true;
    }
    expect(
      threw,
      "(vertical, region) unique constraint not enforced — seed could create duplicates",
    ).toBe(true);
  });
});
