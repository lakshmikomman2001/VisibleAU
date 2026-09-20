/**
 * Prod-safe AU vertical-pack seeder. Touches ONLY vertical_packs and
 * vertical_pack_prompts — unlike `pnpm seed` (db/seed/seed.ts), it does NOT
 * fabricate subscription rows or wipe recommendationResearch/citabilityMethods.
 * Use this against Neon/prod DBs; use `pnpm seed` only in local dev (guarded).
 *
 * Reuses the same pack definitions and prompt arrays as db/seed/seed.ts
 * verbatim — no prompt content is retyped here.
 *
 * Usage:
 *   SEED_DATABASE_URL=postgresql://... pnpm tsx scripts/ops/seed-vertical-packs.ts
 */
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { verticalPackPrompts, verticalPacks } from "../../db/schema";
import { AU_ALLIED_HEALTH_PROMPTS } from "../../db/seed/verticals/au-allied-health";
import { AU_SAAS_PROMPTS } from "../../db/seed/verticals/au-saas";
import { AU_TRADIES_PROMPTS } from "../../db/seed/verticals/au-tradies";

interface PackDef {
  vertical: "tradies" | "allied_health" | "saas";
  region: "au";
  name: string;
  version: string;
  prompts: ReadonlyArray<{
    readonly rank: number;
    readonly promptTemplate: string;
    readonly category: string;
    readonly expectedMentionType: string;
  }>;
}

const PACKS: PackDef[] = [
  { vertical: "tradies", region: "au", name: "AU Tradies v1.0", version: "v1.0", prompts: AU_TRADIES_PROMPTS },
  {
    vertical: "allied_health",
    region: "au",
    name: "AU Allied Health v1.0",
    version: "v1.0",
    prompts: AU_ALLIED_HEALTH_PROMPTS,
  },
  { vertical: "saas", region: "au", name: "AU SaaS v1.0", version: "v1.0", prompts: AU_SAAS_PROMPTS },
];

async function seedPack(db: ReturnType<typeof drizzle>, def: PackDef) {
  const [pack] = await db
    .insert(verticalPacks)
    .values({
      vertical: def.vertical,
      region: def.region,
      name: def.name,
      version: def.version,
      promptsCount: 0,
      metadata: { author: "sri", source: "manual-curation", approvedAt: new Date().toISOString() },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [verticalPacks.vertical, verticalPacks.region],
      set: {
        name: sql`excluded.name`,
        version: sql`excluded.version`,
        updatedAt: new Date(),
        promptsCount: 0,
      },
    })
    .returning();

  await db.delete(verticalPackPrompts).where(eq(verticalPackPrompts.packId, pack.id));

  await db.insert(verticalPackPrompts).values(
    def.prompts.map((p, i) => ({
      packId: pack.id,
      promptTemplate: p.promptTemplate,
      rank: p.rank ?? i + 1,
      category: p.category,
      expectedMentionType: p.expectedMentionType,
    })),
  );

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(verticalPackPrompts)
    .where(eq(verticalPackPrompts.packId, pack.id));

  await db.update(verticalPacks).set({ promptsCount: count }).where(eq(verticalPacks.id, pack.id));

  console.log(`  ${def.vertical}/${def.region} → ${count} prompts inserted`);
}

async function main() {
  const dbUrl = process.env.SEED_DATABASE_URL;
  if (!dbUrl) {
    console.error("SEED_DATABASE_URL is required (refusing to fall back to a default).");
    process.exit(1);
  }

  let host = "unknown";
  let role = "unknown";
  try {
    const parsed = new URL(dbUrl);
    host = parsed.hostname;
    role = decodeURIComponent(parsed.username);
  } catch {
    // leave as "unknown" — still safe to proceed, just can't print the target
  }
  console.log(`[seed-vertical-packs] target host: ${host} (role: ${role})`);

  const client = postgres(dbUrl, { max: 1 });
  const db = drizzle(client);

  try {
    for (const def of PACKS) {
      await seedPack(db, def);
    }
    console.log("[seed-vertical-packs] done — 3 AU packs converged.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[seed-vertical-packs] Fatal error:", err);
  process.exit(1);
});
