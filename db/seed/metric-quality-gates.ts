import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { metricQualityGates } from "../schema/metric-quality-gates";

const AU_EN_QUALITY_GATES = [
  { metricKey: "frequency", marketCode: "AU_EN", minimumSamples: 10, minimumProviderCount: 2 },
  { metricKey: "sentiment", marketCode: "AU_EN", minimumSamples: 10, minimumProviderCount: 2 },
  { metricKey: "accuracy", marketCode: "AU_EN", minimumSamples: 5, minimumProviderCount: 2 },
  { metricKey: "position", marketCode: "AU_EN", minimumSamples: 10, minimumProviderCount: 2 },
  { metricKey: "context", marketCode: "AU_EN", minimumSamples: 10, minimumProviderCount: 2 },
  { metricKey: "composite", marketCode: "AU_EN", minimumSamples: 3, minimumProviderCount: 2 },
  { metricKey: "citation_source", marketCode: "AU_EN", minimumSamples: 5, minimumProviderCount: 2 },
] as const;

export { AU_EN_QUALITY_GATES };

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  console.log("[seed] Seeding metric_quality_gates (7 AU_EN rows)...");
  await db
    .insert(metricQualityGates)
    .values([...AU_EN_QUALITY_GATES])
    .onConflictDoNothing();
  console.log("[seed] metric_quality_gates seeded.");

  await client.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[seed] Fatal:", err);
    process.exit(1);
  });
}
