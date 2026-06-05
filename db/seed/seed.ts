import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { recommendationResearch, verticalPackPrompts, verticalPacks } from "../schema";
import { RESEARCH_CITATIONS } from "./recommendations/research-citations";
import { AU_ALLIED_HEALTH_PROMPTS } from "./verticals/au-allied-health";
import { AU_SAAS_PROMPTS } from "./verticals/au-saas";
import { AU_TRADIES_PROMPTS } from "./verticals/au-tradies";

const client = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(client);

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
  {
    vertical: "tradies",
    region: "au",
    name: "AU Tradies v1.0",
    version: "v1.0",
    prompts: AU_TRADIES_PROMPTS,
  },
  {
    vertical: "allied_health",
    region: "au",
    name: "AU Allied Health v1.0",
    version: "v1.0",
    prompts: AU_ALLIED_HEALTH_PROMPTS,
  },
  {
    vertical: "saas",
    region: "au",
    name: "AU SaaS v1.0",
    version: "v1.0",
    prompts: AU_SAAS_PROMPTS,
  },
];

async function seedPack(def: PackDef) {
  console.log(`[seed] Upserting pack: ${def.name} (${def.prompts.length} prompts)`);

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

  console.log(`[seed] ✓ ${def.name}: ${count} prompts`);
}

async function main() {
  console.log("[seed] Starting vertical pack seed...");
  for (const def of PACKS) {
    await seedPack(def);
  }
  console.log("[seed] Done. 3 packs seeded.");

  console.log("[seed] Seeding research citations...");
  await db.delete(recommendationResearch);
  await db.insert(recommendationResearch).values(RESEARCH_CITATIONS);
  console.log(`[seed] ✓ ${RESEARCH_CITATIONS.length} research citations seeded.`);

  await client.end();
}

main().catch((err) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
