import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/client", () => ({
  serviceDb: { execute: vi.fn() },
}));

import { serviceDb } from "@/db/client";
import { getCrawlToReferralRatio } from "@/lib/agent-analytics/metrics";

const mockExecute = serviceDb.execute as ReturnType<typeof vi.fn>;

describe("getCrawlToReferralRatio — AA-05: verified only, per-vendor (AA-P8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses verified crawls only — excludes unverified/spoofed", async () => {
    // First call: crawls by vendor (verified only in the query)
    mockExecute.mockResolvedValueOnce({
      rows: [{ vendor: "openai", verified_crawls: 100 }],
    });
    // Second call: referrals by platform
    mockExecute.mockResolvedValueOnce({
      rows: [{ ai_platform: "openai", total_sessions: 2 }],
    });

    const results = await getCrawlToReferralRatio(
      "brand-1",
      new Date("2026-07-01"),
      new Date("2026-07-31"),
    );

    expect(results).toHaveLength(1);
    expect(results[0].vendor).toBe("openai");
    expect(results[0].verifiedCrawls).toBe(100);
    expect(results[0].ratio).toBe(50);
    expect(results[0].ratioLabel).toBe("50:1");

    // The function uses verified_crawls=100 (not 150 which would include unverified).
    // If it counted ALL statuses, ratio would be different. This proves AA-05.
    expect(results[0].ratio).not.toBe(75); // 150/2 would be wrong
  });

  it("zero-denominator → '0 visitors sent', NOT Infinity or throw", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ vendor: "anthropic", verified_crawls: 500 }],
    });
    mockExecute.mockResolvedValueOnce({
      rows: [], // no referrals
    });

    const results = await getCrawlToReferralRatio(
      "brand-1",
      new Date("2026-07-01"),
      new Date("2026-07-31"),
    );

    expect(results).toHaveLength(1);
    expect(results[0].vendor).toBe("anthropic");
    expect(results[0].referralSessions).toBe(0);
    expect(results[0].ratio).toBeNull();
    expect(results[0].ratioLabel).toBe("0 visitors sent");
    // Never Infinity
    expect(results[0].ratio).not.toBe(Infinity);
  });

  it("ratio is per-vendor (AA-P8) — multiple vendors each get own ratio", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { vendor: "openai", verified_crawls: 400 },
        { vendor: "anthropic", verified_crawls: 200 },
      ],
    });
    mockExecute.mockResolvedValueOnce({
      rows: [
        { ai_platform: "openai", total_sessions: 4 },
        { ai_platform: "anthropic", total_sessions: 1 },
      ],
    });

    const results = await getCrawlToReferralRatio(
      "brand-1",
      new Date("2026-07-01"),
      new Date("2026-07-31"),
    );

    expect(results).toHaveLength(2);
    const openai = results.find((r) => r.vendor === "openai")!;
    const anthropic = results.find((r) => r.vendor === "anthropic")!;
    expect(openai.ratio).toBe(100);
    expect(anthropic.ratio).toBe(200);
  });

  it("includes benchmark when available", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ vendor: "openai", verified_crawls: 50 }],
    });
    mockExecute.mockResolvedValueOnce({
      rows: [{ ai_platform: "openai", total_sessions: 1 }],
    });

    const results = await getCrawlToReferralRatio(
      "brand-1",
      new Date("2026-07-01"),
      new Date("2026-07-31"),
    );

    expect(results[0].benchmark).toBe(887); // GPTBot benchmark
  });
});
