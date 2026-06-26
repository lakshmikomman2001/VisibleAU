import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { providerMarketCapabilities } from "../../db/schema/provider-market-capabilities";

function parseArgs(): { allEnabledMarkets: boolean } {
  return { allEnabledMarkets: process.argv.includes("--all-enabled-markets") };
}

export async function run(): Promise<void> {
  const { allEnabledMarkets } = parseArgs();
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  const enabledProviders = await db
    .select()
    .from(providerMarketCapabilities)
    .where(eq(providerMarketCapabilities.isEnabled, true));

  const markets = new Set(enabledProviders.map((p) => p.marketCode));

  if (markets.size === 0) {
    console.error("✗ No enabled providers found in any market");
    await client.end();
    process.exit(1);
  }

  console.log(`[config:coverage] Found ${markets.size} market(s) with enabled providers`);

  let failures = 0;
  for (const market of markets) {
    const marketProviders = enabledProviders.filter((p) => p.marketCode === market);
    const hasWebRetrieval = marketProviders.some((p) => p.supportsWebRetrieval);
    const hasCitations = marketProviders.some((p) => p.supportsCitations);
    const hasLocationContext = marketProviders.some((p) => p.supportsLocationContext);
    const hasFanOut = marketProviders.some((p) => p.supportsQueryFanOut);

    console.log(`\n  Market: ${market} (${marketProviders.length} providers)`);
    console.log(`    Web retrieval: ${hasWebRetrieval ? "✓" : "✗"}`);
    console.log(`    Citations:     ${hasCitations ? "✓" : "✗"}`);
    console.log(`    Location ctx:  ${hasLocationContext ? "✓" : "✗"}`);
    console.log(`    Fan-out:       ${hasFanOut ? "✓" : "✗"}`);

    if (!hasWebRetrieval || !hasCitations) {
      failures++;
    }
  }

  await client.end();

  if (failures > 0) {
    console.error(`\n✗ ${failures} market(s) with insufficient coverage`);
    process.exit(1);
  }
  console.log("\n✓ Coverage check passed");
}
