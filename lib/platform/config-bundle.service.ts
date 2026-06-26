import { and, eq, ne } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "@/db/client";
import { configBundleCache } from "@/db/schema/config-bundle-cache";
import { ObservabilityService } from "./observability.service";
import type { ConfigBundle } from "./types";

const DEFAULT_CONFIG: Record<string, unknown> = {
  version: 1,
  market: "AU_EN",
  locale: "en-AU",
  segment: "smb",
};

export class ConfigBundleService {
  static async resolve(
    market: string,
    locale: string,
    segment: string,
  ): Promise<ConfigBundle> {
    const [active] = await db
      .select()
      .from(configBundleCache)
      .where(
        and(
          eq(configBundleCache.marketCode, market),
          eq(configBundleCache.locale, locale),
          eq(configBundleCache.segment, segment),
          eq(configBundleCache.isActive, true),
        ),
      );

    if (active) {
      ObservabilityService.emit({
        name: "config_bundle_loaded",
        data: { market, locale, segment, bundleId: active.id },
      });
      return active;
    }

    ObservabilityService.emit({
      name: "config_fallback_used",
      data: { market, locale, segment },
    });

    const fallbackConfig = { ...DEFAULT_CONFIG, market, locale, segment };
    const digest = ConfigBundleService.computeDigest(fallbackConfig);

    const [fallback] = await db
      .insert(configBundleCache)
      .values({
        marketCode: market,
        locale,
        segment,
        bundleVersion: 1,
        configDigest: digest,
        resolvedConfig: fallbackConfig,
        isActive: true,
      })
      .onConflictDoNothing()
      .returning();

    if (fallback) return fallback;

    const [existing] = await db
      .select()
      .from(configBundleCache)
      .where(
        and(
          eq(configBundleCache.marketCode, market),
          eq(configBundleCache.locale, locale),
          eq(configBundleCache.segment, segment),
          eq(configBundleCache.isActive, true),
        ),
      );
    return existing!;
  }

  static async get(bundleId: string): Promise<ConfigBundle | undefined> {
    const [bundle] = await db
      .select()
      .from(configBundleCache)
      .where(eq(configBundleCache.id, bundleId));
    return bundle;
  }

  static async activate(newId: string): Promise<void> {
    const [bundle] = await db
      .select()
      .from(configBundleCache)
      .where(eq(configBundleCache.id, newId));
    if (!bundle) throw new Error(`Bundle ${newId} not found`);

    await db.transaction(async (tx) => {
      await tx
        .update(configBundleCache)
        .set({ isActive: false })
        .where(
          and(
            eq(configBundleCache.marketCode, bundle.marketCode),
            eq(configBundleCache.locale, bundle.locale),
            eq(configBundleCache.segment, bundle.segment),
            ne(configBundleCache.id, newId),
          ),
        );

      await tx
        .update(configBundleCache)
        .set({ isActive: true })
        .where(eq(configBundleCache.id, newId));
    });
  }

  static async invalidate(market: string): Promise<void> {
    await db
      .update(configBundleCache)
      .set({ isActive: false })
      .where(eq(configBundleCache.marketCode, market));
  }

  static computeDigest(config: Record<string, unknown>): string {
    return createHash("sha256").update(JSON.stringify(config)).digest("hex");
  }
}
