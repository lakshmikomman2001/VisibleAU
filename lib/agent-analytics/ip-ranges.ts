import { createHash } from "crypto";
import { isIP } from "node:net";
import { and, eq, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { aiBotIpRanges } from "@/db/schema/ai-bot-ip-ranges";
import { aiBotRegistry } from "@/db/schema/ai-bot-registry";

// Task #46 (10th follow-up): ai_bot_ip_ranges.cidr is now a native
// Postgres `cidr` column (was `text`) -- an invalid value now fails the
// INSERT instead of being silently stored. Validate vendor-published
// prefixes before they reach the DB so one malformed entry in a
// vendor's JSON doesn't abort refreshIpRangesForVendor's whole loop.
export function isValidCidr(value: string): boolean {
  const [address, prefixStr] = value.split("/");
  if (!address) return false;
  const family = isIP(address);
  if (family === 0) return false;
  if (prefixStr === undefined) return true; // bare address is still a valid (host-route) cidr value
  const prefix = Number(prefixStr);
  const maxPrefix = family === 4 ? 32 : 128;
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= maxPrefix;
}

export async function checkCidrContainment(sourceIp: string, vendor: string): Promise<boolean> {
  const result = await serviceDb.execute(sql`
    SELECT 1 FROM ai_bot_ip_ranges
    WHERE vendor = ${vendor}
      AND is_current = true
      AND ${sourceIp}::inet <<= cidr::cidr
    LIMIT 1
  `);
  return (result as unknown as unknown[]).length > 0;
}

export interface RefreshResult {
  vendor: string;
  status: "updated" | "unchanged" | "failed";
  rangeCount?: number;
  error?: string;
}

export async function refreshIpRangesForVendor(
  vendor: string,
  sourceUrl: string,
): Promise<RefreshResult> {
  let body: string;
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return { vendor, status: "failed", error: `HTTP ${res.status}` };
    }
    body = await res.text();
  } catch (err) {
    return {
      vendor,
      status: "failed",
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }

  let prefixes: string[];
  try {
    const json = JSON.parse(body);
    if (Array.isArray(json.prefixes)) {
      prefixes = json.prefixes
        .map(
          (p: { ipv4Prefix?: string; ipv6Prefix?: string; ip_prefix?: string }) =>
            p.ipv4Prefix ?? p.ipv6Prefix ?? p.ip_prefix,
        )
        .filter(Boolean);
    } else if (Array.isArray(json)) {
      prefixes = json.filter((v: unknown) => typeof v === "string");
    } else {
      return { vendor, status: "failed", error: "Unexpected JSON schema — fail closed (AA-06)" };
    }
  } catch {
    return { vendor, status: "failed", error: "Malformed JSON — fail closed (AA-06)" };
  }

  const invalidCount = prefixes.length - prefixes.filter(isValidCidr).length;
  if (invalidCount > 0) {
    // Not PII -- these are the vendor's own published infrastructure ranges, not
    // visitor IPs, so logging the literal value is safe and useful for debugging
    // a vendor JSON format change.
    console.debug(
      `refreshIpRangesForVendor(${vendor}): dropping ${invalidCount} invalid cidr value(s): ` +
        prefixes.filter((p) => !isValidCidr(p)).join(", "),
    );
    prefixes = prefixes.filter(isValidCidr);
  }

  if (prefixes.length === 0) {
    return { vendor, status: "failed", error: "Empty prefix list — fail closed (AA-06)" };
  }

  const versionHash = createHash("sha256").update(JSON.stringify(prefixes.sort())).digest("hex");

  const existing = await serviceDb
    .select({ versionHash: aiBotIpRanges.versionHash })
    .from(aiBotIpRanges)
    .where(and(eq(aiBotIpRanges.vendor, vendor), eq(aiBotIpRanges.isCurrent, true)))
    .limit(1);

  if (existing.length > 0 && existing[0].versionHash === versionHash) {
    return { vendor, status: "unchanged", rangeCount: prefixes.length };
  }

  await serviceDb
    .update(aiBotIpRanges)
    .set({ isCurrent: false })
    .where(and(eq(aiBotIpRanges.vendor, vendor), eq(aiBotIpRanges.isCurrent, true)));

  for (const cidr of prefixes) {
    await serviceDb
      .insert(aiBotIpRanges)
      .values({
        vendor,
        cidr,
        sourceUrl,
        versionHash,
        isCurrent: true,
      })
      .onConflictDoNothing();
  }

  return { vendor, status: "updated", rangeCount: prefixes.length };
}

export async function refreshAllIpRanges(): Promise<RefreshResult[]> {
  const vendors = await serviceDb
    .select({
      vendor: aiBotRegistry.vendor,
      cidrSourceUrl: aiBotRegistry.cidrSourceUrl,
    })
    .from(aiBotRegistry)
    .where(eq(aiBotRegistry.isActive, true));

  const uniqueUrls = new Map<string, string>();
  for (const v of vendors) {
    if (v.cidrSourceUrl && !uniqueUrls.has(v.cidrSourceUrl)) {
      uniqueUrls.set(v.cidrSourceUrl, v.vendor);
    }
  }

  const results: RefreshResult[] = [];
  for (const [url, vendor] of uniqueUrls) {
    results.push(await refreshIpRangesForVendor(vendor, url));
  }
  return results;
}
