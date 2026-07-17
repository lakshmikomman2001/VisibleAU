import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("dns", () => ({
  promises: {
    reverse: vi.fn(),
    resolve4: vi.fn(),
    resolve6: vi.fn(),
    resolveTxt: vi.fn(),
  },
}));

vi.mock("@/lib/agent-analytics/ip-ranges", () => ({
  checkCidrContainment: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  serviceDb: {},
}));

import { promises as dns } from "dns";
import { checkCidrContainment } from "@/lib/agent-analytics/ip-ranges";
import {
  verifyCrawlerHit,
  clearVerificationCache,
  type VerificationResult,
} from "@/lib/agent-analytics/verify-crawler-hits";
import type { RegistryMatch } from "@/lib/agent-analytics/bot-registry";

const mockedDns = dns as unknown as {
  reverse: ReturnType<typeof vi.fn>;
  resolve4: ReturnType<typeof vi.fn>;
  resolve6: ReturnType<typeof vi.fn>;
  resolveTxt: ReturnType<typeof vi.fn>;
};
const mockedCidr = checkCidrContainment as ReturnType<typeof vi.fn>;

function makeRegistry(overrides: Partial<RegistryMatch> = {}): RegistryMatch {
  return {
    uaToken: "GPTBot",
    vendor: "openai",
    crawlerTier: "must_allow",
    defaultPurpose: "indexing",
    isAgentUa: false,
    aiPlatform: "openai",
    verificationPaths: ["cidr", "fcrdns", "asn"],
    cidrSourceUrl: "https://openai.com/gptbot-ranges.json",
    ptrDomainSuffix: ".openai.com",
    expectedAsns: [394161],
    ...overrides,
  };
}

beforeEach(() => {
  clearVerificationCache();
  vi.resetAllMocks();
});

// ── Group A: Verification Engine ──

describe("A1: CIDR hit → verified/cidr", () => {
  it("returns verified via cidr when IP is in published range", async () => {
    mockedCidr.mockResolvedValue(true);

    const result = await verifyCrawlerHit("40.88.21.235", makeRegistry());

    expect(result.status).toBe("verified");
    expect(result.verifiedVia).toBe("cidr");
    expect(mockedCidr).toHaveBeenCalledWith("40.88.21.235", "openai");
  });
});

describe("A2: FCrDNS round-trip → verified/fcrdns", () => {
  it("returns verified via fcrdns when PTR + forward DNS round-trip matches", async () => {
    const registry = makeRegistry({
      verificationPaths: ["fcrdns"],
      cidrSourceUrl: null,
    });

    mockedDns.reverse.mockResolvedValue(["crawl-40-88-21-235.googlebot.com"]);
    mockedDns.resolve4.mockResolvedValue(["40.88.21.235"]);

    const result = await verifyCrawlerHit(
      "40.88.21.235",
      makeRegistry({
        ...registry,
        ptrDomainSuffix: ".googlebot.com",
        vendor: "google",
      }),
    );

    expect(result.status).toBe("verified");
    expect(result.verifiedVia).toBe("fcrdns");
  });
});

describe("A3: FCrDNS PTR suffix mismatch → spoofed/fcrdns", () => {
  it("returns spoofed when PTR does not end with expected suffix", async () => {
    mockedCidr.mockResolvedValue(false);
    mockedDns.reverse.mockResolvedValue(["badguy.example.com"]);

    const result = await verifyCrawlerHit("198.51.100.99", makeRegistry());

    expect(result.status).toBe("spoofed");
    expect(result.verifiedVia).toBe("fcrdns");
  });
});

describe("A4: No PTR (dns.reverse throws) → unverified (NOT spoofed)", () => {
  it("returns unverified when reverse DNS throws (TEST-NET / no PTR)", async () => {
    mockedCidr.mockResolvedValue(false);
    mockedDns.reverse.mockRejectedValue(new Error("NXDOMAIN"));
    mockedDns.resolveTxt.mockRejectedValue(new Error("NXDOMAIN"));

    const result = await verifyCrawlerHit("203.0.113.10", makeRegistry());

    expect(result.status).toBe("unverified");
    expect(result.status).not.toBe("spoofed");
  });
});

describe("A5: ASN matches but alone → unverified (AA-09)", () => {
  it("never promotes to verified on ASN alone", async () => {
    const registry = makeRegistry({
      verificationPaths: ["asn"],
      cidrSourceUrl: null,
      ptrDomainSuffix: null,
    });

    mockedDns.resolveTxt.mockResolvedValue([["394161 | 40.88.0.0/14 | US | arin |"]]);

    const result = await verifyCrawlerHit("40.88.21.235", registry);

    expect(result.status).toBe("unverified");
    expect(result.status).not.toBe("verified");
  });
});

describe("A6: ASN contradicts → spoofed/asn", () => {
  it("returns spoofed when ASN does not match expected vendor ASNs", async () => {
    const registry = makeRegistry({
      verificationPaths: ["asn"],
      cidrSourceUrl: null,
      ptrDomainSuffix: null,
      expectedAsns: [394161],
    });

    mockedDns.resolveTxt.mockResolvedValue([["13335 | 104.28.0.0/20 | US | arin |"]]);

    const result = await verifyCrawlerHit("104.28.1.5", registry);

    expect(result.status).toBe("spoofed");
    expect(result.verifiedVia).toBe("asn");
  });
});
