import { promises as dns } from "dns";
import { sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { checkCidrContainment } from "./ip-ranges";
import type { RegistryMatch } from "./bot-registry";

export type VerificationStatus = "verified" | "unverified" | "spoofed";
export type VerifiedVia = "cidr" | "fcrdns" | "asn" | null;

export interface VerificationResult {
  status: VerificationStatus;
  verifiedVia: VerifiedVia;
  reason: string;
}

const verificationCache = new Map<string, { result: VerificationResult; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(sourceIp: string, vendor: string): string {
  return `${sourceIp}:${vendor}`;
}

export function clearVerificationCache(): void {
  verificationCache.clear();
}

export async function verifyCrawlerHit(
  sourceIp: string,
  registryEntry: RegistryMatch,
): Promise<VerificationResult> {
  const key = cacheKey(sourceIp, registryEntry.vendor);
  const cached = verificationCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  const paths = registryEntry.verificationPaths;
  let result: VerificationResult;

  if (paths.length === 0) {
    result = { status: "unverified", verifiedVia: null, reason: "No verification paths configured" };
  } else {
    result = await runVerificationPaths(sourceIp, registryEntry, paths);
  }

  verificationCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

async function runVerificationPaths(
  sourceIp: string,
  entry: RegistryMatch,
  paths: string[],
): Promise<VerificationResult> {
  for (const path of paths) {
    switch (path) {
      case "cidr": {
        if (!entry.cidrSourceUrl) continue;
        const inRange = await checkCidrContainment(sourceIp, entry.vendor);
        if (inRange) {
          return { status: "verified", verifiedVia: "cidr", reason: "IP in published CIDR range" };
        }
        break;
      }

      case "fcrdns": {
        if (!entry.ptrDomainSuffix) continue;
        const fcrdnsResult = await verifyFcrdns(sourceIp, entry.ptrDomainSuffix);
        if (fcrdnsResult === "verified") {
          return { status: "verified", verifiedVia: "fcrdns", reason: "Forward-confirmed reverse DNS passed" };
        }
        if (fcrdnsResult === "spoofed") {
          return { status: "spoofed", verifiedVia: "fcrdns", reason: "FCrDNS failed — likely impersonation" };
        }
        break;
      }

      case "asn": {
        if (!entry.expectedAsns || entry.expectedAsns.length === 0) continue;
        const asnResult = await verifyAsn(sourceIp, entry.expectedAsns);
        if (asnResult === "contradicts") {
          return { status: "spoofed", verifiedVia: "asn", reason: "ASN does not match expected vendor ASNs" };
        }
        // AA-09: ASN alone NEVER yields verified — at most unverified
        break;
      }
    }
  }

  return { status: "unverified", verifiedVia: null, reason: "No verification path succeeded" };
}

async function verifyFcrdns(
  sourceIp: string,
  expectedSuffix: string,
): Promise<"verified" | "spoofed" | "inconclusive"> {
  try {
    // Step 1: reverse DNS
    const hostnames = await dns.reverse(sourceIp);
    if (!hostnames || hostnames.length === 0) return "inconclusive";

    const ptr = hostnames[0];

    // Step 2: PTR must end with the expected suffix
    if (!ptr.endsWith(expectedSuffix)) return "spoofed";

    // Step 3: forward DNS the PTR hostname
    let forwardIps: string[];
    try {
      forwardIps = await dns.resolve4(ptr);
    } catch {
      try {
        forwardIps = await dns.resolve6(ptr);
      } catch {
        return "spoofed";
      }
    }

    // Step 4: forward result must equal original IP
    if (forwardIps.includes(sourceIp)) return "verified";

    return "spoofed";
  } catch {
    return "inconclusive";
  }
}

async function verifyAsn(
  sourceIp: string,
  expectedAsns: number[],
): Promise<"matches" | "contradicts" | "inconclusive"> {
  try {
    // Use DNS-based ASN lookup via Team Cymru
    const reversed = sourceIp.split(".").reverse().join(".");
    const query = `${reversed}.origin.asn.cymru.com`;
    const records = await dns.resolveTxt(query);
    if (!records || records.length === 0) return "inconclusive";

    const asnStr = records[0]?.[0]?.split("|")?.[0]?.trim();
    if (!asnStr) return "inconclusive";

    const asn = parseInt(asnStr, 10);
    if (isNaN(asn)) return "inconclusive";

    return expectedAsns.includes(asn) ? "matches" : "contradicts";
  } catch {
    return "inconclusive";
  }
}

export async function batchVerify(
  hits: Array<{ sourceIp: string; registryEntry: RegistryMatch }>,
): Promise<Map<string, VerificationResult>> {
  const uniqueTuples = new Map<string, { sourceIp: string; registryEntry: RegistryMatch }>();

  for (const hit of hits) {
    const key = cacheKey(hit.sourceIp, hit.registryEntry.vendor);
    if (!uniqueTuples.has(key)) {
      uniqueTuples.set(key, hit);
    }
  }

  const results = new Map<string, VerificationResult>();

  for (const [key, { sourceIp, registryEntry }] of uniqueTuples) {
    results.set(key, await verifyCrawlerHit(sourceIp, registryEntry));
  }

  return results;
}
