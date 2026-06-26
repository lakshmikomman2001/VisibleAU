import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { providerMarketCapabilities } from "../schema/provider-market-capabilities";

const AU_EN_PROVIDERS = [
  {
    providerKey: "openai",
    modelKey: "gpt-4o",
    marketCode: "AU_EN",
    locale: "en-AU",
    supportsWebRetrieval: true,
    supportsCitations: true,
    supportsLocationContext: true,
    supportsQueryFanOut: true,
    maxFanOutSubQueries: 12,
    isEnabled: true,
  },
  {
    providerKey: "anthropic",
    modelKey: "claude-3-5-sonnet",
    marketCode: "AU_EN",
    locale: "en-AU",
    supportsWebRetrieval: true,
    supportsCitations: true,
    supportsLocationContext: true,
    supportsQueryFanOut: true,
    maxFanOutSubQueries: 10,
    isEnabled: true,
  },
  {
    providerKey: "google",
    modelKey: "gemini-1.5-pro",
    marketCode: "AU_EN",
    locale: "en-AU",
    supportsWebRetrieval: true,
    supportsCitations: true,
    supportsLocationContext: true,
    supportsQueryFanOut: true,
    maxFanOutSubQueries: 12,
    isEnabled: true,
  },
  {
    providerKey: "perplexity",
    modelKey: "pplx-70b-online",
    marketCode: "AU_EN",
    locale: "en-AU",
    supportsWebRetrieval: true,
    supportsCitations: true,
    supportsLocationContext: true,
    supportsQueryFanOut: false,
    maxFanOutSubQueries: 8,
    isEnabled: true,
  },
] as const;

export { AU_EN_PROVIDERS };

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  console.log("[seed] Seeding provider_market_capabilities (4 AU_EN providers)...");
  await db
    .insert(providerMarketCapabilities)
    .values([...AU_EN_PROVIDERS])
    .onConflictDoNothing();
  console.log("[seed] provider_market_capabilities seeded.");

  await client.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[seed] Fatal:", err);
    process.exit(1);
  });
}
