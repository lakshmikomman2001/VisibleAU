import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { providerMarketCapabilities } from "@/db/schema/provider-market-capabilities";
import { TIER_ENGINES } from "@/lib/llm/tier-engines";
import type { Provider } from "./types";

export class ProviderCapabilityRegistry {
  static async getEnabledProviders(
    market: string,
    locale: string,
  ): Promise<Provider[]> {
    return db
      .select()
      .from(providerMarketCapabilities)
      .where(
        and(
          eq(providerMarketCapabilities.marketCode, market),
          eq(providerMarketCapabilities.locale, locale),
          eq(providerMarketCapabilities.isEnabled, true),
        ),
      );
  }

  static async canHandle(
    providerKey: string,
    market: string,
    _useCase: string,
  ): Promise<boolean> {
    const [row] = await db
      .select()
      .from(providerMarketCapabilities)
      .where(
        and(
          eq(providerMarketCapabilities.providerKey, providerKey),
          eq(providerMarketCapabilities.marketCode, market),
          eq(providerMarketCapabilities.isEnabled, true),
        ),
      );
    return !!row;
  }

  static async supportsFanOut(
    providerKey: string,
    market: string,
  ): Promise<boolean> {
    const [row] = await db
      .select({ supportsQueryFanOut: providerMarketCapabilities.supportsQueryFanOut })
      .from(providerMarketCapabilities)
      .where(
        and(
          eq(providerMarketCapabilities.providerKey, providerKey),
          eq(providerMarketCapabilities.marketCode, market),
          eq(providerMarketCapabilities.isEnabled, true),
        ),
      );
    return row?.supportsQueryFanOut ?? false;
  }

  static async getBestProvider(
    market: string,
    _useCase: string,
    tier: string,
  ): Promise<Provider | undefined> {
    const tierEngines = TIER_ENGINES[tier] ?? TIER_ENGINES.free;
    const enabled = await ProviderCapabilityRegistry.getEnabledProviders(
      market,
      "en-AU",
    );

    const eligible = enabled.filter((p) =>
      tierEngines.includes(p.providerKey as (typeof tierEngines)[number]),
    );

    if (eligible.length === 0) return undefined;

    return eligible.sort((a, b) =>
      a.providerKey.localeCompare(b.providerKey),
    )[0];
  }
}
