import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { configBundleCache } from "../../db/schema/config-bundle-cache";

function parseArgs(): { from: number; to: number; market: string } {
  const args = process.argv.slice(3);
  let from = 1;
  let to = 2;
  let market = "AU_EN";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) from = Number(args[++i]);
    if (args[i] === "--to" && args[i + 1]) to = Number(args[++i]);
    if (args[i] === "--market" && args[i + 1]) market = args[++i];
  }

  return { from, to, market };
}

export async function run(): Promise<void> {
  const { from, to, market } = parseArgs();
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client);

  console.log(
    `[config:diff] Comparing v${from} → v${to} for market=${market}`,
  );

  const [bundleFrom] = await db
    .select()
    .from(configBundleCache)
    .where(
      and(
        eq(configBundleCache.marketCode, market),
        eq(configBundleCache.bundleVersion, from),
      ),
    );

  const [bundleTo] = await db
    .select()
    .from(configBundleCache)
    .where(
      and(
        eq(configBundleCache.marketCode, market),
        eq(configBundleCache.bundleVersion, to),
      ),
    );

  if (!bundleFrom) {
    console.error(`✗ Version ${from} not found for market ${market}`);
    await client.end();
    process.exit(1);
  }
  if (!bundleTo) {
    console.error(`✗ Version ${to} not found for market ${market}`);
    await client.end();
    process.exit(1);
  }

  if (bundleFrom.configDigest === bundleTo.configDigest) {
    console.log("  No changes (digests match)");
  } else {
    console.log(`  Digest: ${bundleFrom.configDigest.slice(0, 12)}… → ${bundleTo.configDigest.slice(0, 12)}…`);

    const configFrom = bundleFrom.resolvedConfig as Record<string, unknown>;
    const configTo = bundleTo.resolvedConfig as Record<string, unknown>;

    const allKeys = new Set([
      ...Object.keys(configFrom),
      ...Object.keys(configTo),
    ]);

    for (const key of allKeys) {
      const valFrom = JSON.stringify(configFrom[key]);
      const valTo = JSON.stringify(configTo[key]);

      if (valFrom !== valTo) {
        if (valFrom === undefined) {
          console.log(`  + ${key}: ${valTo}`);
        } else if (valTo === undefined) {
          console.log(`  - ${key}: ${valFrom}`);
        } else {
          console.log(`  ~ ${key}: ${valFrom} → ${valTo}`);
        }
      }
    }
  }

  await client.end();
}
