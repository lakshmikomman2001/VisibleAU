import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { configBundleCache } from "../../db/schema/config-bundle-cache";
import { marketAiBudgetPolicies } from "../../db/schema/market-ai-budget-policies";
import { promptPackCoverage } from "../../db/schema/prompt-pack-coverage";
import { providerMarketCapabilities } from "../../db/schema/provider-market-capabilities";
import { samplingPolicies } from "../../db/schema/sampling-policies";

function parseArgs(): { market: string; locale: string } {
  const args = process.argv.slice(3);
  let market = "AU_EN";
  let locale = "en-AU";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--market" && args[i + 1]) market = args[++i];
    if (args[i] === "--locale" && args[i + 1]) locale = args[++i];
  }

  return { market, locale };
}

export async function run(): Promise<void> {
  const { market, locale } = parseArgs();
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);
  let failures = 0;

  console.log(`[config:validate] Validating market=${market} locale=${locale}`);

  // 1. Active config bundle exists
  const [bundle] = await db
    .select()
    .from(configBundleCache)
    .where(
      and(
        eq(configBundleCache.marketCode, market),
        eq(configBundleCache.isActive, true),
      ),
    );

  if (bundle) {
    console.log(`  ✓ Active config bundle: v${bundle.bundleVersion}`);
  } else {
    console.error("  ✗ No active config bundle found");
    failures++;
  }

  // 2. At least one enabled provider
  const providers = await db
    .select()
    .from(providerMarketCapabilities)
    .where(
      and(
        eq(providerMarketCapabilities.marketCode, market),
        eq(providerMarketCapabilities.locale, locale),
        eq(providerMarketCapabilities.isEnabled, true),
      ),
    );

  if (providers.length > 0) {
    console.log(`  ✓ Enabled providers: ${providers.length}`);
  } else {
    console.error("  ✗ No enabled providers found");
    failures++;
  }

  // 3. Budget policy exists
  const [budgetPolicy] = await db
    .select()
    .from(marketAiBudgetPolicies)
    .where(eq(marketAiBudgetPolicies.marketCode, market));

  if (budgetPolicy) {
    console.log("  ✓ Budget policy found");
  } else {
    console.error("  ✗ No budget policy found");
    failures++;
  }

  // 4. Sampling policy exists
  const [samplingPolicy] = await db
    .select()
    .from(samplingPolicies)
    .where(eq(samplingPolicies.marketCode, market));

  if (samplingPolicy) {
    console.log("  ✓ Sampling policy found");
  } else {
    console.error("  ✗ No sampling policy found");
    failures++;
  }

  // 5. Prompt pack coverage
  const [coverage] = await db
    .select()
    .from(promptPackCoverage)
    .where(
      and(
        eq(promptPackCoverage.marketCode, market),
        eq(promptPackCoverage.locale, locale),
      ),
    );

  if (coverage) {
    if (coverage.coverageStatus === "complete") {
      console.log("  ✓ Prompt pack coverage: complete");
    } else {
      console.error(`  ✗ Prompt pack coverage: ${coverage.coverageStatus}`);
      failures++;
    }
  } else {
    console.log("  ○ No prompt pack coverage row (optional for Sprint 1)");
  }

  await client.end();

  if (failures > 0) {
    console.error(`\n✗ ${failures} validation failures`);
    process.exit(1);
  } else {
    console.log("\n✓ All config validations passed");
  }
}
