import { isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { brands } from "@/db/schema";
import { classifyAndStoreBrand } from "@/lib/brands/classify-and-store";

async function main() {
  console.log("=== Classification Backfill (dev/mock mode) ===");
  console.log("LLM_MODE:", process.env.LLM_MODE ?? "not set (defaults to real)");
  console.log("DATABASE_URL:", process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@"));
  console.log("");

  const unclassified = await db
    .select({ id: brands.id, name: brands.name, organizationId: brands.organizationId })
    .from(brands)
    .where(isNull(brands.classification));

  console.log(`Found ${unclassified.length} unclassified brand(s):`);
  unclassified.forEach((b) => console.log(`  - ${b.name} (${b.id})`));
  console.log("");

  for (const brand of unclassified) {
    console.log(`Classifying: ${brand.name}...`);
    await classifyAndStoreBrand(brand.id);
    console.log(`  Done.`);
  }

  console.log("");
  console.log("=== Verifying results ===");
  const results = await db
    .select({
      name: brands.name,
      classificationStatus: brands.classificationStatus,
      classification: brands.classification,
      promptPackVersion: brands.promptPackVersion,
    })
    .from(brands);

  for (const r of results) {
    const cat = r.classification ? (r.classification as { category?: string }).category : null;
    console.log(`  ${r.name}: status=${r.classificationStatus}, category=${cat}, packVersion=${r.promptPackVersion}`);
  }

  console.log("");
  console.log("=== Testing idempotency (checking for remaining unclassified) ===");
  const secondPass = await db
    .select({ id: brands.id, name: brands.name })
    .from(brands)
    .where(isNull(brands.classification));
  console.log(`Unclassified brands after backfill: ${secondPass.length} (should be 0)`);

  if (secondPass.length === 0) {
    console.log("Idempotency confirmed — re-running would find nothing to classify.");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
