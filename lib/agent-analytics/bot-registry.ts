import { eq, and } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { aiBotRegistry } from "@/db/schema/ai-bot-registry";
import type { AiBotRegistry } from "@/db/schema";

export type RegistryMatch = {
  uaToken: string;
  vendor: string;
  crawlerTier: "must_allow" | "emerging" | "data";
  defaultPurpose: "retrieval" | "indexing" | "training" | null;
  isAgentUa: boolean;
  aiPlatform: string | null;
  verificationPaths: string[];
  cidrSourceUrl: string | null;
  ptrDomainSuffix: string | null;
  expectedAsns: number[] | null;
};

let registryCache: AiBotRegistry[] | null = null;
let registryCacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadRegistry(): Promise<AiBotRegistry[]> {
  const now = Date.now();
  if (registryCache && now - registryCacheAt < CACHE_TTL_MS) return registryCache;

  registryCache = await serviceDb
    .select()
    .from(aiBotRegistry)
    .where(eq(aiBotRegistry.isActive, true));
  registryCacheAt = now;
  return registryCache;
}

export function clearRegistryCache(): void {
  registryCache = null;
  registryCacheAt = 0;
}

export async function lookupByUserAgent(
  userAgent: string,
): Promise<RegistryMatch | null> {
  const rows = await loadRegistry();

  for (const row of rows) {
    const matched =
      row.matchMode === "exact"
        ? userAgent === row.uaToken
        : userAgent.includes(row.uaToken);

    if (matched) {
      return {
        uaToken: row.uaToken,
        vendor: row.vendor,
        crawlerTier: row.crawlerTier as RegistryMatch["crawlerTier"],
        defaultPurpose: row.defaultPurpose as RegistryMatch["defaultPurpose"],
        isAgentUa: row.isAgentUa,
        aiPlatform: row.aiPlatform,
        verificationPaths: (row.verificationPaths as string[]) ?? [],
        cidrSourceUrl: row.cidrSourceUrl,
        ptrDomainSuffix: row.ptrDomainSuffix,
        expectedAsns: row.expectedAsns,
      };
    }
  }

  return null;
}

export async function getRegistryForVendor(
  vendor: string,
): Promise<AiBotRegistry[]> {
  const rows = await loadRegistry();
  return rows.filter((r) => r.vendor === vendor);
}
