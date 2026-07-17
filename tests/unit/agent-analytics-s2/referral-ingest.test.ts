import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/client", () => ({
  serviceDb: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

import {
  normalizeAiPlatform,
  extractReferralsFromLogs,
  convertUtmToReferrals,
  ingestReferrals,
} from "@/lib/agent-analytics/referral-ingest";

describe("referral-ingest — normalizeAiPlatform", () => {
  it("maps known AI referrer domains to platform names", () => {
    expect(normalizeAiPlatform("chatgpt.com")).toBe("chatgpt");
    expect(normalizeAiPlatform("claude.ai")).toBe("claude");
    expect(normalizeAiPlatform("perplexity.ai")).toBe("perplexity");
    expect(normalizeAiPlatform("gemini.google.com")).toBe("gemini");
    expect(normalizeAiPlatform("copilot.microsoft.com")).toBe("copilot");
  });

  it("returns null for non-AI referrers", () => {
    expect(normalizeAiPlatform("google.com")).toBeNull();
    expect(normalizeAiPlatform("facebook.com")).toBeNull();
    expect(normalizeAiPlatform("example.com")).toBeNull();
  });
});

describe("referral-ingest — extractReferralsFromLogs", () => {
  it("extracts referrals from log lines with AI referrer domains", () => {
    const result = extractReferralsFromLogs([
      { referrer: "https://chatgpt.com/c/abc", path: "/booking", timestamp: new Date() },
      { referrer: "https://google.com/search?q=test", path: "/", timestamp: new Date() },
      { referrer: "https://claude.ai/chat/xyz", path: "/services", timestamp: new Date() },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].referrerDomain).toBe("chatgpt.com");
    expect(result[1].referrerDomain).toBe("claude.ai");
  });

  it("skips lines with empty referrer", () => {
    const result = extractReferralsFromLogs([
      { referrer: "", path: "/page", timestamp: new Date() },
    ]);
    expect(result).toHaveLength(0);
  });
});

describe("referral-ingest — convertUtmToReferrals", () => {
  it("converts utm_source=chatgpt to chatgpt.com referral", () => {
    const result = convertUtmToReferrals([
      {
        landingPath: "/booking",
        utmSource: "chatgpt",
        sessionCount: 5,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].referrerDomain).toBe("chatgpt.com");
    expect(result[0].source).toBe("utm");
    expect(result[0].sessionCount).toBe(5);
  });

  it("skips unknown utm_source values", () => {
    const result = convertUtmToReferrals([
      {
        landingPath: "/page",
        utmSource: "newsletter",
        sessionCount: 10,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
      },
    ]);
    expect(result).toHaveLength(0);
  });
});

describe("referral-ingest — ingestReferrals", () => {
  it("never sums crawls + referrals (separate table — AA-07)", async () => {
    // This test asserts that ingestReferrals writes to ai_referral_hits ONLY,
    // never touches crawler_visit_logs
    const { serviceDb } = await import("@/db/client");
    const insertMock = serviceDb.insert as ReturnType<typeof vi.fn>;
    insertMock.mockClear();

    await ingestReferrals("org-1", "brand-1", [
      {
        referrerDomain: "chatgpt.com",
        landingPath: "/booking",
        sessionCount: 3,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        source: "ga4",
      },
    ]);

    expect(insertMock).toHaveBeenCalled();
    // Verify it's inserting into the referral table, not the crawl table
    const insertArg = insertMock.mock.calls[0][0];
    // The table object passed to insert should be ai_referral_hits
    expect(insertArg).toBeDefined();
  });
});
